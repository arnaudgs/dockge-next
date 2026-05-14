import fs from "fs";
import path from "path";
import { log } from "./log";

/**
 * Per-PID GPU statistics via DRM fdinfo (Linux only).
 *
 * Vendor-agnostic: works on AMD (amdgpu), Intel (i915/xe) and modern NVIDIA
 * drivers that export DRM fdinfo. Reads `/proc/<pid>/fdinfo/*` files exposed
 * by the kernel and aggregates:
 *  - drm-engine-* (cumulative ns per engine, requires delta sampling for %)
 *  - drm-memory-vram / drm-memory-gtt (resident GPU memory in KiB)
 */

export interface GpuCardInfo {
    card : string;
    vendor : string;
    pciId : string | null;
}

export interface GpuStat {
    vramMb : number;
    gttMb : number;
    percent : number;
}

interface EngineSnapshot {
    timestampNs : bigint;
    engineNs : bigint;
}

const VENDOR_NAMES : Record<string, string> = {
    "0x1002": "AMD",
    "0x10de": "NVIDIA",
    "0x8086": "Intel",
};

// Cache previous engine samples per PID for delta-based % computation.
// Map key: PID (string), value: snapshot.
const prevSnapshots = new Map<string, EngineSnapshot>();

let detectedCards : GpuCardInfo[] | null = null;

/**
 * Returns the list of DRM cards available on the host.
 * The result is cached after the first call.
 */
export function detectGpus() : GpuCardInfo[] {
    if (detectedCards !== null) {
        return detectedCards;
    }
    const cards : GpuCardInfo[] = [];
    try {
        const drmDir = "/sys/class/drm";
        if (!fs.existsSync(drmDir)) {
            detectedCards = cards;
            return cards;
        }
        const entries = fs.readdirSync(drmDir);
        for (const entry of entries) {
            if (!/^card\d+$/.test(entry)) {
                continue;
            }
            try {
                const vendor = fs.readFileSync(path.join(drmDir, entry, "device", "vendor"), "utf-8").trim();
                let pciId : string | null = null;
                try {
                    pciId = fs.readlinkSync(path.join(drmDir, entry, "device")).split("/").pop() || null;
                } catch (e) {
                    pciId = null;
                }
                cards.push({
                    card: entry,
                    vendor: VENDOR_NAMES[vendor] || vendor,
                    pciId,
                });
            } catch (e) {
                // ignore unreadable card entries
            }
        }
    } catch (e) {
        log.warn("gpu", "detectGpus failed: " + (e instanceof Error ? e.message : String(e)));
    }
    detectedCards = cards;
    return cards;
}

/**
 * True when at least one DRM card is exposed by the kernel.
 */
export function hasGpu() : boolean {
    return detectGpus().length > 0;
}

/**
 * Group all PIDs on the host by the value of the `pm_id` env var injected by
 * PM2. Detached children (`setsid` / `detached: true`) still inherit env, so
 * this catches grandchildren like ffmpeg spawned by a PM2-managed Node app
 * even after they lose their parent link to PM2's process tree.
 *
 * Returned map key is the `pm_id` string. PIDs without a `pm_id` env are
 * skipped. One pass over /proc, so cheap enough to run every refresh tick.
 */
export function scanPidsByPm2Id() : Map<string, number[]> {
    const result = new Map<string, number[]>();
    let entries : string[];
    try {
        entries = fs.readdirSync("/proc");
    } catch (e) {
        return result;
    }
    for (const entry of entries) {
        const pid = Number(entry);
        if (!Number.isFinite(pid) || pid <= 0) {
            continue;
        }
        let environ : string;
        try {
            environ = fs.readFileSync(`/proc/${pid}/environ`, "utf-8");
        } catch (e) {
            // Permission denied (other users' processes) or PID just exited.
            continue;
        }
        // env is NUL-separated; bail early if no PM2 markers to avoid splitting.
        if (!environ.includes("pm_id=")) {
            continue;
        }
        let pmId : string | null = null;
        for (const piece of environ.split("\0")) {
            if (piece.startsWith("pm_id=")) {
                pmId = piece.slice(6);
                break;
            }
        }
        if (pmId === null) {
            continue;
        }
        let list = result.get(pmId);
        if (!list) {
            list = [];
            result.set(pmId, list);
        }
        list.push(pid);
    }
    return result;
}

/**
 * BFS walk of `/proc/<pid>/task/<tid>/children` to collect a process and all
 * its descendants. Bounded by `maxPids` to keep cost predictable when a tree
 * has thousands of forks. Returns at least `[rootPid]` if the root is alive.
 */
export function collectDescendantPids(rootPid : number, maxPids = 512) : number[] {
    const result = new Set<number>();
    const queue : number[] = [ rootPid ];
    while (queue.length > 0 && result.size < maxPids) {
        const pid = queue.shift() as number;
        if (result.has(pid)) {
            continue;
        }
        result.add(pid);
        let tids : string[];
        try {
            tids = fs.readdirSync(`/proc/${pid}/task`);
        } catch (e) {
            continue;
        }
        for (const tid of tids) {
            try {
                const childrenStr = fs.readFileSync(`/proc/${pid}/task/${tid}/children`, "utf-8").trim();
                if (!childrenStr) {
                    continue;
                }
                for (const token of childrenStr.split(/\s+/)) {
                    const n = Number(token);
                    if (Number.isFinite(n) && n > 0 && !result.has(n)) {
                        queue.push(n);
                    }
                }
            } catch (e) {
                // tid disappeared between readdir and read — ignore
            }
        }
    }
    return Array.from(result);
}

interface RawSample {
    engineNs : bigint;
    vramKb : number;
    gttKb : number;
}

const ENGINE_PREFIXES = [ "drm-engine-" ];
const MEMORY_KEYS = [ "drm-memory-vram", "drm-memory-gtt" ];
const TOTAL_VRAM_KEY = "drm-total-vram";
const TOTAL_GTT_KEY = "drm-total-gtt";

function parseKiB(value : string) : number {
    // Format examples: "13476 KiB", "0", "12 MiB"
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d+)\s*(KiB|MiB|GiB|B)?$/i);
    if (!match) {
        return 0;
    }
    const n = Number(match[1]);
    const unit = (match[2] || "KiB").toUpperCase();
    if (unit === "B") {
        return Math.round(n / 1024);
    }
    if (unit === "MIB") {
        return n * 1024;
    }
    if (unit === "GIB") {
        return n * 1024 * 1024;
    }
    return n;
}

function readFdinfoForPid(pid : number) : RawSample | null {
    const dir = `/proc/${pid}/fdinfo`;
    let entries : string[];
    try {
        entries = fs.readdirSync(dir);
    } catch (e) {
        return null;
    }
    let engineNs = 0n;
    let vramKb = 0;
    let gttKb = 0;
    // Some drivers also expose drm-total-* without drm-memory-* — fall back to those.
    let totalVramKb = 0;
    let totalGttKb = 0;
    let hasDrm = false;
    // De-dup: a process can map the same client multiple times across fds.
    const seenClients = new Set<string>();

    for (const entry of entries) {
        let content : string;
        try {
            content = fs.readFileSync(path.join(dir, entry), "utf-8");
        } catch (e) {
            continue;
        }
        if (!content.includes("drm-driver")) {
            continue;
        }
        hasDrm = true;
        let clientId = "";
        let localEngineNs = 0n;
        let localVramKb = 0;
        let localGttKb = 0;
        let localTotalVramKb = 0;
        let localTotalGttKb = 0;
        for (const line of content.split("\n")) {
            const colonIdx = line.indexOf(":");
            if (colonIdx < 0) {
                continue;
            }
            const key = line.slice(0, colonIdx).trim().toLowerCase();
            const value = line.slice(colonIdx + 1);
            if (key === "drm-client-id") {
                clientId = value.trim();
                continue;
            }
            if (ENGINE_PREFIXES.some((p) => key.startsWith(p))) {
                const m = value.trim().match(/^(\d+)\s*ns$/);
                if (m) {
                    localEngineNs += BigInt(m[1]);
                }
                continue;
            }
            if (key === "drm-memory-vram") {
                localVramKb = Math.max(localVramKb, parseKiB(value));
                continue;
            }
            if (key === "drm-memory-gtt") {
                localGttKb = Math.max(localGttKb, parseKiB(value));
                continue;
            }
            if (key === TOTAL_VRAM_KEY) {
                localTotalVramKb = Math.max(localTotalVramKb, parseKiB(value));
                continue;
            }
            if (key === TOTAL_GTT_KEY) {
                localTotalGttKb = Math.max(localTotalGttKb, parseKiB(value));
                continue;
            }
        }
        const dedupKey = clientId || entry;
        if (seenClients.has(dedupKey)) {
            continue;
        }
        seenClients.add(dedupKey);
        engineNs += localEngineNs;
        vramKb += (localVramKb || localTotalVramKb);
        gttKb += (localGttKb || localTotalGttKb);
    }
    if (!hasDrm) {
        return null;
    }
    return { engineNs, vramKb, gttKb };
}

function nowNs() : bigint {
    return process.hrtime.bigint();
}

/**
 * Aggregate GPU stats for groups of PIDs. The map key is opaque (stack name,
 * container id, pm2 pmId...) and the returned map keeps the same key.
 *
 * Percent is computed as `delta_engine_ns / delta_wall_ns * 100`, summed
 * across the group's PIDs and across every DRM engine (gfx, compute, enc,
 * dec, ...). Each engine is an independent execution unit, so a single
 * process maxing both the gfx and decode engines reports ~200 %, two
 * processes each saturating the decode engine report ~200 %, etc.
 * No upper cap — matches what btop / nvtop display. First call returns 0%.
 */
export function getGpuStatsByPids(groups : Map<string, number[]>) : Map<string, GpuStat> {
    const result = new Map<string, GpuStat>();
    if (!hasGpu()) {
        for (const key of groups.keys()) {
            result.set(key, { vramMb: 0, gttMb: 0, percent: 0 });
        }
        return result;
    }

    const sampleTs = nowNs();
    const seenPids = new Set<string>();

    for (const [ key, pids ] of groups) {
        let vramKb = 0;
        let gttKb = 0;
        let groupEngineNs = 0n;
        let prevEngineNs = 0n;
        let prevTs : bigint | null = null;
        let anySample = false;

        for (const pid of pids) {
            const sample = readFdinfoForPid(pid);
            if (!sample) {
                continue;
            }
            anySample = true;
            vramKb += sample.vramKb;
            gttKb += sample.gttKb;
            groupEngineNs += sample.engineNs;

            const pidKey = String(pid);
            seenPids.add(pidKey);
            const prev = prevSnapshots.get(pidKey);
            if (prev) {
                prevEngineNs += prev.engineNs;
                if (prevTs === null || prev.timestampNs < prevTs) {
                    prevTs = prev.timestampNs;
                }
            }
            prevSnapshots.set(pidKey, { timestampNs: sampleTs, engineNs: sample.engineNs });
        }

        let percent = 0;
        if (anySample && prevTs !== null) {
            const wallDelta = sampleTs - prevTs;
            const engineDelta = groupEngineNs - prevEngineNs;
            if (wallDelta > 0n && engineDelta > 0n) {
                // BigInt scaling avoids overflow on long deltas. No upper cap:
                // multiple engines (and multiple PIDs) can legitimately sum
                // past 100 %.
                percent = Number(engineDelta * 10000n / wallDelta) / 100;
            }
        }

        result.set(key, {
            vramMb: Math.round(vramKb / 1024),
            gttMb: Math.round(gttKb / 1024),
            percent: Math.round(percent * 10) / 10,
        });
    }

    // Garbage-collect snapshots for PIDs we no longer see.
    for (const pidKey of prevSnapshots.keys()) {
        if (!seenPids.has(pidKey)) {
            prevSnapshots.delete(pidKey);
        }
    }

    return result;
}
