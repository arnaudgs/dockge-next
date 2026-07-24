import fs from "fs";
import { execSync } from "child_process";
import { log } from "./log";

/**
 * Per-PID CPU / memory statistics read straight from `/proc` (Linux only).
 *
 * Acts as a fallback for PM2's own `monit` values: after a long daemon uptime
 * the PM2 God daemon sometimes stops sampling and reports `cpu: 0, memory: 0`
 * for every process (visible in `pm2 list` too). Reading `/proc/<pid>` lets
 * Dockge display real figures regardless of the daemon's monitoring state.
 *
 *  - memory : `/proc/<pid>/status` → VmRSS (resident set size), in bytes.
 *  - cpu    : `/proc/<pid>/stat`   → utime + stime (clock ticks), turned into a
 *             percentage via delta sampling between two calls.
 */

export interface ProcStat {
    /** CPU percent (single-core relative, matches `top`/pm2). Null until a
     *  second sample is available to compute the delta. */
    cpu : number | null;
    /** Resident memory in bytes. 0 when unreadable. */
    memory : number;
}

interface CpuSnapshot {
    ticks : number;
    tsMs : number;
}

// Previous CPU sample per PID, for delta-based percentage computation.
const prevCpu = new Map<number, CpuSnapshot>();

// Clock ticks per second (USER_HZ). Effectively always 100 on Linux, but read
// it once to stay correct on exotic kernels. Falls back to 100 on any error.
let clkTck = 100;
try {
    const parsed = parseInt(execSync("getconf CLK_TCK").toString().trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
        clkTck = parsed;
    }
} catch (e) {
    log.debug("proc", "getconf CLK_TCK failed, defaulting to 100");
}

/**
 * Read utime + stime (in clock ticks) from `/proc/<pid>/stat`.
 *
 * The comm field (2nd) is wrapped in parentheses and may itself contain spaces
 * or parentheses, so we split on the substring *after* the last ")". From
 * there, fields line up as: index 0 = state (field 3), so field N is at index
 * N - 3 → utime (14) = index 11, stime (15) = index 12.
 */
function readCpuTicks(pid : number) : number | null {
    let content : string;
    try {
        content = fs.readFileSync(`/proc/${pid}/stat`, "utf-8");
    } catch (e) {
        return null;
    }
    const lastParen = content.lastIndexOf(")");
    if (lastParen < 0) {
        return null;
    }
    const rest = content.slice(lastParen + 1).trim().split(/\s+/);
    const utime = Number(rest[11]);
    const stime = Number(rest[12]);
    if (!Number.isFinite(utime) || !Number.isFinite(stime)) {
        return null;
    }
    return utime + stime;
}

/**
 * Read resident memory (VmRSS) from `/proc/<pid>/status`, returned in bytes.
 */
function readRssBytes(pid : number) : number {
    let content : string;
    try {
        content = fs.readFileSync(`/proc/${pid}/status`, "utf-8");
    } catch (e) {
        return 0;
    }
    const match = content.match(/^VmRSS:\s+(\d+)\s*kB/m);
    if (!match) {
        return 0;
    }
    return Number(match[1]) * 1024;
}

/**
 * Compute CPU% and memory for the given PIDs from `/proc`.
 *
 * CPU is `delta_ticks / CLK_TCK / delta_seconds * 100`, single-core relative
 * (can exceed 100 on multi-threaded processes), matching PM2's own convention.
 * The first observation of a PID returns `cpu: null` (no delta yet); the next
 * refresh tick fills it in. Memory is instantaneous.
 */
export function getProcStats(pids : number[]) : Map<number, ProcStat> {
    const result = new Map<number, ProcStat>();
    const nowMs = Date.now();
    const seen = new Set<number>();

    for (const pid of pids) {
        if (!Number.isFinite(pid) || pid <= 0) {
            continue;
        }
        seen.add(pid);

        const memory = readRssBytes(pid);
        const ticks = readCpuTicks(pid);

        let cpu : number | null = null;
        if (ticks !== null) {
            const prev = prevCpu.get(pid);
            if (prev) {
                const deltaTicks = ticks - prev.ticks;
                const deltaSec = (nowMs - prev.tsMs) / 1000;
                if (deltaSec > 0 && deltaTicks >= 0) {
                    cpu = Math.round(((deltaTicks / clkTck) / deltaSec) * 1000) / 10;
                }
            }
            prevCpu.set(pid, { ticks, tsMs: nowMs });
        }

        result.set(pid, { cpu, memory });
    }

    // Drop cached samples for PIDs we no longer track.
    for (const pid of prevCpu.keys()) {
        if (!seen.has(pid)) {
            prevCpu.delete(pid);
        }
    }

    return result;
}
