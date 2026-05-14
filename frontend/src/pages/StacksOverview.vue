<template>
    <transition name="slide-fade" appear>
        <div>
            <h1 class="mb-3">
                <font-awesome-icon icon="layer-group" class="me-2" />
                {{ $t("stacksOverview") }}
                <span v-if="stacks.length > 0" class="badge bg-secondary ms-2">{{ stacks.length }}</span>
            </h1>

            <!-- Aggregate KPIs -->
            <div class="row g-3 mb-4">
                <div class="col-6 col-md-3">
                    <div class="shadow-box big-padding stat-card">
                        <div class="stat-label">{{ $t("runningStacks") }}</div>
                        <div class="stat-value">
                            {{ runningCount }}<span class="stat-unit">/ {{ stacks.length }}</span>
                        </div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="shadow-box big-padding stat-card">
                        <div class="stat-label">{{ $t("Container | Containers") }}</div>
                        <div class="stat-value stat-mono">{{ totalContainers }}</div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="shadow-box big-padding stat-card">
                        <div class="stat-label">{{ $t("CPU") }}</div>
                        <div class="stat-value">{{ totalCpu.toFixed(1) }}<span class="stat-unit">%</span></div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="shadow-box big-padding stat-card">
                        <div class="stat-label">{{ $t("memory") }}</div>
                        <div class="stat-value">{{ totalMemoryValue }}<span class="stat-unit">{{ totalMemoryUnit }}</span></div>
                    </div>
                </div>
            </div>

            <div v-if="hasGpu" class="row g-3 mb-4">
                <div class="col-6 col-md-3">
                    <div class="shadow-box big-padding stat-card">
                        <div class="stat-label">{{ $t("gpuUsage") }}</div>
                        <div class="stat-value">{{ totalGpuPercent.toFixed(1) }}<span class="stat-unit">%</span></div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="shadow-box big-padding stat-card">
                        <div class="stat-label">{{ $t("gpuMemory") }}</div>
                        <div class="stat-value">{{ totalGpuVram }}<span class="stat-unit">MB</span></div>
                    </div>
                </div>
                <div class="col-12 col-md-6">
                    <div class="shadow-box big-padding stat-card">
                        <div class="stat-label">{{ $t("gpuCards") }}</div>
                        <div class="stat-value-sm">
                            <span v-for="(c, i) in gpuCards" :key="i" class="gpu-card-chip">
                                {{ c.vendor }}<span v-if="c.pciId" class="text-muted"> · {{ c.pciId }}</span>
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="mb-3 d-flex flex-wrap align-items-center gap-2">
                <button class="btn btn-normal" :disabled="loading" @click="refresh">
                    <font-awesome-icon icon="sync" :spin="loading" class="me-1" />
                    {{ $t("Refresh") }}
                </button>

                <label class="form-check form-switch mb-0 ms-auto">
                    <input v-model="runningOnly" class="form-check-input" type="checkbox" />
                    <span class="form-check-label">{{ $t("runningOnly") }}</span>
                </label>
            </div>

            <div v-if="filteredStacks.length === 0" class="shadow-box big-padding text-center no-stacks">
                <font-awesome-icon icon="check" class="me-2" />
                {{ runningOnly ? $t("stacksNoRunning") : $t("stacksNoneFound") }}
            </div>

            <div v-else class="shadow-box stacks-table-box">
                <div class="table-responsive">
                    <table class="table table-hover mb-0 align-middle stacks-table">
                        <thead>
                            <tr>
                                <th class="sortable" @click="sortBy('name')">
                                    {{ $t("Name") }} <SortIcon :col="'name'" :sort-key="sortKey" :sort-dir="sortDir" />
                                </th>
                                <th class="sortable" @click="sortBy('status')">
                                    {{ $t("Status") }} <SortIcon :col="'status'" :sort-key="sortKey" :sort-dir="sortDir" />
                                </th>
                                <th class="text-end sortable" @click="sortBy('containers')">
                                    {{ $t("Container | Containers") }} <SortIcon :col="'containers'" :sort-key="sortKey" :sort-dir="sortDir" />
                                </th>
                                <th class="text-end sortable" @click="sortBy('cpu')">
                                    {{ $t("CPU") }} <SortIcon :col="'cpu'" :sort-key="sortKey" :sort-dir="sortDir" />
                                </th>
                                <th class="text-end sortable" @click="sortBy('memory')">
                                    {{ $t("memory") }} <SortIcon :col="'memory'" :sort-key="sortKey" :sort-dir="sortDir" />
                                </th>
                                <th v-if="hasGpu" class="text-end sortable" @click="sortBy('gpuPercent')">
                                    {{ $t("gpu") }} <SortIcon :col="'gpuPercent'" :sort-key="sortKey" :sort-dir="sortDir" />
                                </th>
                                <th v-if="$root.agentCount > 1" class="sortable" @click="sortBy('endpoint')">
                                    {{ $t("endpoint") }} <SortIcon :col="'endpoint'" :sort-key="sortKey" :sort-dir="sortDir" />
                                </th>
                                <th class="text-end">{{ $t("pm2Actions") }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="row in sortedStacks"
                                :key="row.endpoint + '|' + row.name"
                                class="stack-row"
                                @click="goToStack(row)"
                            >
                                <td>
                                    <span class="stack-name">{{ row.name }}</span>
                                    <span v-if="row.hasUpdates" class="badge update-badge ms-2" :title="$t('updateAvailable')">
                                        <font-awesome-icon icon="circle-up" />
                                    </span>
                                </td>
                                <td>
                                    <span class="stack-status" :class="`status-${row.statusName}`">
                                        <span class="status-dot"></span>
                                        {{ row.statusLabel }}
                                    </span>
                                </td>
                                <td class="text-end stat-mono">
                                    {{ row.containers || "—" }}
                                </td>
                                <td class="text-end">
                                    <div class="metric-cell">
                                        <span class="metric-value">{{ row.cpu.toFixed(1) }}%</span>
                                        <div class="metric-bar">
                                            <div class="metric-fill cpu" :style="{ width: Math.min(row.cpu, 100) + '%' }"></div>
                                        </div>
                                    </div>
                                </td>
                                <td class="text-end">
                                    <div class="metric-cell">
                                        <span class="metric-value">{{ formatBytes(row.memory) }}</span>
                                        <div class="metric-bar">
                                            <div class="metric-fill mem" :style="{ width: memoryPercent(row.memory) + '%' }"></div>
                                        </div>
                                    </div>
                                </td>
                                <td v-if="hasGpu" class="text-end">
                                    <div class="metric-cell">
                                        <span class="metric-value">{{ row.gpuPercent.toFixed(1) }}% · {{ row.gpuVramMb }}MB</span>
                                        <div class="metric-bar">
                                            <div class="metric-fill gpu" :style="{ width: Math.min(row.gpuPercent, 100) + '%' }"></div>
                                        </div>
                                    </div>
                                </td>
                                <td v-if="$root.agentCount > 1" class="text-muted small">
                                    {{ row.endpoint || $t("currentEndpoint") }}
                                </td>
                                <td class="text-end text-nowrap action-cell" @click.stop>
                                    <button
                                        class="btn btn-sm btn-outline-normal me-1 action-btn"
                                        :disabled="busy[row.key] || !row.isRunning"
                                        :title="$t('Restart')"
                                        @click="onAction(row, 'restartStack')"
                                    >
                                        <font-awesome-icon icon="sync" :spin="busy[row.key] === 'restartStack'" />
                                    </button>
                                    <button
                                        v-if="row.isRunning"
                                        class="btn btn-sm btn-outline-normal action-btn action-btn-danger"
                                        :disabled="!!busy[row.key]"
                                        :title="$t('Stop')"
                                        @click="onAction(row, 'stopStack')"
                                    >
                                        <font-awesome-icon icon="stop" />
                                    </button>
                                    <button
                                        v-else
                                        class="btn btn-sm btn-outline-normal action-btn action-btn-success"
                                        :disabled="!!busy[row.key]"
                                        :title="$t('Start')"
                                        @click="onAction(row, 'startStack')"
                                    >
                                        <font-awesome-icon icon="play" />
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </transition>
</template>

<script>
import { defineComponent, h } from "vue";
import { RUNNING, statusName, statusNameShort } from "../../../common/util-common";

const SortIcon = defineComponent({
    props: {
        col: { type: String, required: true },
        sortKey: { type: String, required: true },
        sortDir: { type: String, required: true },
    },
    render() {
        if (this.col !== this.sortKey) {
            return h("span", { class: "sort-icon sort-icon-inactive" }, "↕");
        }
        return h("span", { class: "sort-icon" }, this.sortDir === "asc" ? "↑" : "↓");
    },
});

const REFRESH_INTERVAL_MS = 3000;

export default {
    components: { SortIcon },
    data() {
        return {
            statsByEndpoint: {},
            loading: false,
            sortKey: "name",
            sortDir: "asc",
            runningOnly: false,
            busy: {},
            statsTimer: null,
            hasGpu: false,
            gpuCards: [],
        };
    },
    computed: {
        stacks() {
            const list = [];
            const stackMap = this.$root.completeStackList || {};
            for (const key in stackMap) {
                const stack = stackMap[key];
                const endpoint = stack.endpoint || "";
                const stats = this.aggregateStatsForStack(endpoint, stack.name);
                const sName = statusName(stack.status);
                list.push({
                    key,
                    name: stack.name,
                    endpoint,
                    status: stack.status,
                    statusName: sName,
                    statusLabel: this.$t(sName),
                    isManagedByDockge: stack.isManagedByDockge,
                    hasUpdates: !!(stack.updates && stack.updates.length > 0),
                    isRunning: stack.status === RUNNING,
                    isInactive: statusNameShort(stack.status) === "inactive",
                    containers: stats.count,
                    cpu: stats.cpu,
                    memory: stats.memory,
                    gpuPercent: stats.gpuPercent,
                    gpuVramMb: stats.gpuVramMb,
                });
            }
            return list;
        },
        filteredStacks() {
            if (!this.runningOnly) {
                return this.stacks;
            }
            return this.stacks.filter((s) => s.isRunning);
        },
        sortedStacks() {
            const list = [ ...this.filteredStacks ];
            const dir = this.sortDir === "asc" ? 1 : -1;
            const key = this.sortKey;
            list.sort((a, b) => {
                const va = a[key];
                const vb = b[key];
                if (va == null && vb == null) {
                    return 0;
                }
                if (va == null) {
                    return 1;
                }
                if (vb == null) {
                    return -1;
                }
                if (typeof va === "number" && typeof vb === "number") {
                    return (va - vb) * dir;
                }
                return String(va).localeCompare(String(vb)) * dir;
            });
            return list;
        },
        runningCount() {
            return this.stacks.filter((s) => s.isRunning).length;
        },
        totalContainers() {
            return this.stacks.reduce((sum, s) => sum + (s.containers || 0), 0);
        },
        totalCpu() {
            return this.stacks.reduce((sum, s) => sum + (s.cpu || 0), 0);
        },
        totalMemory() {
            return this.stacks.reduce((sum, s) => sum + (s.memory || 0), 0);
        },
        totalMemoryValue() {
            return this.splitBytes(this.totalMemory).value;
        },
        totalMemoryUnit() {
            return this.splitBytes(this.totalMemory).unit;
        },
        totalGpuPercent() {
            return this.stacks.reduce((sum, s) => sum + (s.gpuPercent || 0), 0);
        },
        totalGpuVram() {
            return this.stacks.reduce((sum, s) => sum + (s.gpuVramMb || 0), 0);
        },
    },
    mounted() {
        this.refresh();
        this.statsTimer = setInterval(() => this.refresh(true), REFRESH_INTERVAL_MS);
    },
    beforeUnmount() {
        if (this.statsTimer) {
            clearInterval(this.statsTimer);
        }
    },
    methods: {
        refresh(silent = false) {
            if (!silent) {
                this.loading = true;
            }
            // Local endpoint
            const endpoints = new Set([ "" ]);
            for (const ep in (this.$root.agentList || {})) {
                if (ep) {
                    endpoints.add(ep);
                }
            }
            let pending = endpoints.size;
            for (const ep of endpoints) {
                this.$root.emitAgent(ep, "dockerStats", (res) => {
                    if (res && res.ok && res.dockerStats) {
                        this.statsByEndpoint[ep] = res.dockerStats;
                        if (ep === "") {
                            this.hasGpu = !!res.hasGpu;
                            this.gpuCards = res.gpuCards || [];
                        }
                    }
                    if (--pending === 0) {
                        this.loading = false;
                    }
                });
            }
            if (endpoints.size === 0) {
                this.loading = false;
            }
        },
        aggregateStatsForStack(endpoint, stackName) {
            const stats = this.statsByEndpoint[endpoint] || {};
            let cpu = 0;
            let memory = 0;
            let count = 0;
            let gpuPercent = 0;
            let gpuVramMb = 0;
            const prefixDash = stackName + "-";
            const prefixUnderscore = stackName + "_";
            for (const name in stats) {
                const c = stats[name];
                // Primary match: docker compose project label (works even when
                // container_name overrides the default <project>-<svc>-<idx>).
                // Fallback: legacy prefix matching for containers without a
                // compose project label.
                const matchesProject = c.ComposeProject && c.ComposeProject === stackName;
                const matchesPrefix = !c.ComposeProject
                    && (name.startsWith(prefixDash) || name.startsWith(prefixUnderscore) || name === stackName);
                if (!matchesProject && !matchesPrefix) {
                    continue;
                }
                count++;
                cpu += this.parsePercent(c.CPUPerc);
                memory += this.parseMemUsage(c.MemUsage);
                gpuPercent += Number(c.GpuPerc) || 0;
                gpuVramMb += Number(c.GpuVramMB) || 0;
            }
            return { cpu, memory, count, gpuPercent, gpuVramMb };
        },
        parsePercent(str) {
            if (!str || typeof str !== "string") {
                return 0;
            }
            const v = parseFloat(str.replace("%", ""));
            return isNaN(v) ? 0 : v;
        },
        parseMemUsage(str) {
            if (!str || typeof str !== "string") {
                return 0;
            }
            // "10.5MiB / 7.65GiB" — keep the first half only
            const first = str.split("/")[0].trim();
            const m = first.match(/^([\d.]+)\s*([KMGTP]?i?B)$/i);
            if (!m) {
                return 0;
            }
            const n = parseFloat(m[1]);
            const unit = m[2].toLowerCase();
            const multipliers = {
                "b": 1,
                "kb": 1000, "kib": 1024,
                "mb": 1e6, "mib": 1024 ** 2,
                "gb": 1e9, "gib": 1024 ** 3,
                "tb": 1e12, "tib": 1024 ** 4,
            };
            return n * (multipliers[unit] || 1);
        },
        splitBytes(bytes) {
            if (!bytes) {
                return { value: "0", unit: " B" };
            }
            const units = [ "B", "KB", "MB", "GB", "TB" ];
            let v = bytes;
            let i = 0;
            while (v >= 1024 && i < units.length - 1) {
                v /= 1024;
                i++;
            }
            return {
                value: v.toFixed(v >= 100 ? 0 : 1),
                unit: " " + units[i],
            };
        },
        formatBytes(bytes) {
            const { value, unit } = this.splitBytes(bytes);
            return value + unit;
        },
        memoryPercent(bytes) {
            // 1 GB ceiling for visual bar
            const ceiling = 1024 ** 3;
            return Math.min((bytes / ceiling) * 100, 100);
        },
        sortBy(key) {
            if (this.sortKey === key) {
                this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
            } else {
                this.sortKey = key;
                this.sortDir = "asc";
            }
        },
        goToStack(row) {
            if (row.endpoint) {
                this.$router.push(`/compose/${encodeURIComponent(row.name)}/${encodeURIComponent(row.endpoint)}`);
            } else {
                this.$router.push(`/compose/${encodeURIComponent(row.name)}`);
            }
        },
        onAction(row, event) {
            this.busy[row.key] = event;
            this.$root.emitAgent(row.endpoint, event, row.name, (res) => {
                delete this.busy[row.key];
                this.$root.toastRes(res);
                this.refresh(true);
            });
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.stat-card {
    height: 100%;
    transition: transform 0.15s ease;

    &:hover {
        transform: translateY(-2px);
    }
}

.stat-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6c757d;
    margin-bottom: 6px;
}

.stat-value {
    font-size: 1.6rem;
    font-weight: 700;
    color: #111;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;

    .stat-unit {
        font-size: 0.85rem;
        font-weight: 400;
        color: #6c757d;
        margin-left: 4px;
    }
}

.stat-mono {
    font-family: 'JetBrains Mono', monospace;
    font-variant-numeric: tabular-nums;
}

.no-stacks {
    color: #6c757d;
}

.stacks-table-box {
    padding: 0;
    overflow: hidden;
    border-radius: 10px;
}

.stacks-table {
    margin-bottom: 0;
    --bs-table-bg: transparent;
    --bs-table-color: inherit;
    background-color: transparent;
    color: inherit;

    th {
        font-weight: 600;
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #6c757d;
        border-bottom: 1px solid rgba(0, 0, 0, 0.08);
        background-color: rgba(0, 0, 0, 0.025);
        white-space: nowrap;
        user-select: none;
    }

    th.sortable {
        cursor: pointer;

        &:hover {
            color: $primary;
        }
    }

    .sort-icon {
        margin-left: 4px;
        color: $primary;
    }

    .sort-icon-inactive {
        color: rgba(0, 0, 0, 0.2);
    }

    td, th {
        padding: 0.7rem 1rem;
        border-color: rgba(0, 0, 0, 0.04);
        vertical-align: middle;
    }
}

.stack-row {
    cursor: pointer;
    transition: background-color 0.15s ease;

    &:hover {
        background-color: rgba(116, 194, 255, 0.06);
    }
}

.stack-name {
    font-weight: 600;
    color: #111;
}

.update-badge {
    background-color: rgba(220, 53, 69, 0.15);
    color: $danger;
    font-size: 11px;
}

.stack-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    text-transform: capitalize;

    .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
    }

    &.status-running {
        color: #198754;

        .status-dot {
            background-color: #198754;
            box-shadow: 0 0 0 3px rgba(25, 135, 84, 0.15);
        }
    }

    &.status-exited {
        color: $danger;

        .status-dot {
            background-color: $danger;
        }
    }

    &.status-draft, &.status-created_stack {
        color: #6c757d;

        .status-dot {
            background-color: #6c757d;
        }
    }

    &.status-unknown {
        color: $warning;

        .status-dot {
            background-color: $warning;
        }
    }
}

.metric-cell {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-end;
    min-width: 84px;

    .metric-value {
        font-family: 'JetBrains Mono', monospace;
        font-variant-numeric: tabular-nums;
        font-size: 0.85rem;
    }

    .metric-bar {
        margin-top: 3px;
        width: 70px;
        height: 4px;
        background-color: rgba(0, 0, 0, 0.06);
        border-radius: 2px;
        overflow: hidden;

        .metric-fill {
            height: 100%;
            transition: width 0.4s $easing-out;

            &.cpu {
                background: $primary-gradient;
            }

            &.mem {
                background: linear-gradient(135deg, #86e6a9 0%, #74c2ff 100%);
            }

            &.gpu {
                background: linear-gradient(135deg, #ff9966 0%, #ff5e62 100%);
            }
        }
    }
}

.stat-value-sm {
    font-size: 0.95rem;
    font-weight: 600;
    color: #111;
    line-height: 1.2;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.gpu-card-chip {
    background-color: rgba(255, 94, 98, 0.1);
    color: #d6534f;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 500;
}

.action-cell {
    cursor: default;
}

.action-btn {
    width: 32px;
    height: 32px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    border-radius: 50%;
    transition: all 0.15s ease;

    &:hover:not(:disabled) {
        transform: translateY(-1px);
    }

    &.action-btn-danger {
        color: $danger;
        border-color: rgba(220, 53, 69, 0.3);

        &:hover:not(:disabled) {
            background-color: $danger;
            color: white;
            border-color: $danger;
        }
    }

    &.action-btn-success {
        color: #198754;
        border-color: rgba(25, 135, 84, 0.3);

        &:hover:not(:disabled) {
            background-color: #198754;
            color: white;
            border-color: #198754;
        }
    }
}

.dark {
    .stat-value {
        color: $dark-font-color;
    }

    .stat-unit, .stat-label, .no-stacks {
        color: $dark-font-color3;
    }

    .stacks-table {
        color: $dark-font-color;

        th {
            color: $dark-font-color3;
            background-color: rgba(255, 255, 255, 0.02);
            border-bottom-color: $dark-border-color;
        }

        td, th {
            border-color: rgba(255, 255, 255, 0.04);
        }

        .sort-icon-inactive {
            color: rgba(255, 255, 255, 0.2);
        }
    }

    .stack-row:hover {
        background-color: rgba(116, 194, 255, 0.08);
    }

    .stack-name {
        color: $dark-font-color;
    }

    .stack-status {
        &.status-running {
            color: #4ade80;

            .status-dot {
                background-color: #4ade80;
                box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.12);
            }
        }

        &.status-exited {
            color: #f87171;

            .status-dot {
                background-color: #f87171;
            }
        }
    }

    .metric-bar {
        background-color: rgba(255, 255, 255, 0.06);
    }
}
</style>
