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
 * Percent is computed as `delta_engine_ns / delta_wall_ns * 100`, summed across
 * the group's PIDs, then capped at 100 * cardCount. First call returns 0%.
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
                // Convert via Number after scaling to avoid overflow.
                const pct = Number(engineDelta * 10000n / wallDelta) / 100;
                percent = Math.min(pct, 100);
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
