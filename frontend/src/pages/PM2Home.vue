<template>
    <transition name="slide-fade" appear>
        <div>
            <h1 class="mb-3">
                <font-awesome-icon icon="microchip" class="me-2" />
                {{ $t("pm2Processes") }}
                <span v-if="state.list.length > 0" class="badge bg-secondary ms-2">{{ state.list.length }}</span>
            </h1>

            <div class="mb-3 d-flex flex-wrap align-items-center gap-2 toolbar">
                <button class="btn btn-normal" :disabled="state.loading" @click="pm2Refresh()">
                    <font-awesome-icon icon="sync" :spin="state.loading" class="me-1" />
                    {{ $t("Refresh") }}
                </button>

                <!-- Mobile-only compact sort selector -->
                <div v-if="$root.isMobile" class="mobile-sort">
                    <select v-model="sortKey" class="form-select form-select-sm sort-key-select">
                        <option value="name">{{ $t("Name") }}</option>
                        <option value="status">{{ $t("pm2Status") }}</option>
                        <option value="cpu">{{ $t("pm2Cpu") }}</option>
                        <option value="memory">{{ $t("pm2Memory") }}</option>
                        <option v-if="state.hasGpu" value="gpuPercent">{{ $t("gpu") }}</option>
                        <option value="uptime">{{ $t("pm2Uptime") }}</option>
                        <option value="restarts">{{ $t("pm2Restarts") }}</option>
                    </select>
                    <button
                        class="btn btn-outline-normal btn-sm sort-dir-btn"
                        :title="sortDir"
                        @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'"
                    >
                        {{ sortDir === "asc" ? "↑" : "↓" }}
                    </button>
                </div>

                <label class="form-check form-switch mb-0 ms-auto">
                    <input v-model="state.autoRefresh" class="form-check-input" type="checkbox" @change="onAutoToggle" />
                    <span class="form-check-label">{{ $t("pm2RefreshInterval", [3]) }}</span>
                </label>
            </div>

            <div v-if="state.error" class="shadow-box big-padding pm2-error mb-3">
                <font-awesome-icon icon="exclamation-triangle" class="me-2" />
                {{ state.error }}
            </div>

            <div v-if="state.list.length === 0 && !state.loading && !state.error" class="shadow-box big-padding text-center no-processes">
                <font-awesome-icon icon="check" class="me-2" />
                {{ $t("pm2NoProcesses") }}
            </div>

            <!-- Mobile cards view -->
            <div v-if="$root.isMobile && state.list.length > 0" class="pm2-cards">
                <div
                    v-for="p in sortedProcesses"
                    :key="p.pmId"
                    class="shadow-box pm2-card"
                    :class="{ 'pm2-card-self': isSelf(p) }"
                    @click="goToDetail(p)"
                >
                    <div class="pm2-card-header">
                        <div class="pm2-card-title">
                            <span class="pm2-id text-muted">#{{ p.pmId }}</span>
                            <span class="pm2-name">{{ p.name }}</span>
                            <span v-if="isSelf(p)" class="badge pm2-self-badge ms-1">self</span>
                        </div>
                        <span class="pm2-status" :class="statusClass(p.status)">
                            <span class="pm2-status-dot"></span>
                            {{ p.status }}
                        </span>
                    </div>

                    <div class="pm2-card-metrics">
                        <div class="metric-tile">
                            <div class="metric-tile-label">{{ $t("pm2Cpu") }}</div>
                            <div class="metric-tile-value">{{ p.cpu }}<span class="unit">%</span></div>
                            <div class="metric-bar">
                                <div class="metric-fill cpu" :style="{ width: Math.min(p.cpu, 100) + '%' }"></div>
                            </div>
                        </div>
                        <div class="metric-tile">
                            <div class="metric-tile-label">{{ $t("pm2Memory") }}</div>
                            <div class="metric-tile-value">{{ formatMemory(p.memory) }}</div>
                            <div class="metric-bar">
                                <div class="metric-fill mem" :style="{ width: memoryPercent(p.memory) + '%' }"></div>
                            </div>
                        </div>
                        <div v-if="state.hasGpu" class="metric-tile">
                            <div class="metric-tile-label">{{ $t("gpu") }}</div>
                            <div class="metric-tile-value">{{ (p.gpuPercent || 0).toFixed(1) }}<span class="unit">%</span> · {{ p.gpuVramMb || 0 }}<span class="unit">MB</span></div>
                            <div class="metric-bar">
                                <div class="metric-fill gpu" :style="{ width: Math.min(p.gpuPercent || 0, 100) + '%' }"></div>
                            </div>
                        </div>
                        <div class="metric-tile">
                            <div class="metric-tile-label">{{ $t("pm2Uptime") }}</div>
                            <div class="metric-tile-value pm2-mono">{{ formatUptime(p.uptime) }}</div>
                        </div>
                        <div class="metric-tile">
                            <div class="metric-tile-label">{{ $t("pm2Restarts") }}</div>
                            <div class="metric-tile-value pm2-mono" :class="{ 'text-warning': p.restarts > 0, 'text-danger': p.unstableRestarts > 0 }">
                                {{ p.restarts }}
                            </div>
                        </div>
                        <div class="metric-tile">
                            <div class="metric-tile-label">{{ $t("pm2Pid") }}</div>
                            <div class="metric-tile-value pm2-mono text-muted">{{ p.pid || "—" }}</div>
                        </div>
                    </div>

                    <div class="pm2-card-actions" @click.stop>
                        <button
                            class="btn btn-sm btn-outline-normal mobile-action-btn"
                            :disabled="busy[p.name] || p.status !== 'online'"
                            @click="onRestart(p)"
                        >
                            <font-awesome-icon icon="sync" :spin="busy[p.name] === 'restart'" class="me-1" />
                            {{ $t("Restart") }}
                        </button>
                        <button
                            v-if="p.status === 'online'"
                            class="btn btn-sm btn-outline-normal mobile-action-btn action-btn-danger"
                            :disabled="!!busy[p.name]"
                            @click="onStop(p)"
                        >
                            <font-awesome-icon icon="stop" class="me-1" />
                            {{ $t("Stop") }}
                        </button>
                        <button
                            v-else
                            class="btn btn-sm btn-outline-normal mobile-action-btn action-btn-success"
                            :disabled="!!busy[p.name]"
                            @click="onStart(p)"
                        >
                            <font-awesome-icon icon="play" class="me-1" />
                            {{ $t("Start") }}
                        </button>
                    </div>
                </div>
            </div>

            <div v-else-if="state.list.length > 0" class="shadow-box pm2-table-box">
                <div class="table-responsive">
                    <table class="table table-hover mb-0 align-middle pm2-table">
                        <thead>
                            <tr>
                                <th class="sortable" @click="sortBy('pmId')">
                                    # <SortIcon :col="'pmId'" :sort-key="sortKey" :sort-dir="sortDir" />
                                </th>
                                <th class="sortable" @click="sortBy('name')">
                                    {{ $t("Name") }} <SortIcon :col="'name'" :sort-key="sortKey" :sort-dir="sortDir" />
                                </th>
                                <th class="sortable" @click="sortBy('status')">
                                    {{ $t("pm2Status") }} <SortIcon :col="'status'" :sort-key="sortKey" :sort-dir="sortDir" />
                                </th>
                                <th class="text-end sortable" @click="sortBy('cpu')">
                                    {{ $t("pm2Cpu") }} <SortIcon :col="'cpu'" :sort-key="sortKey" :sort-dir="sortDir" />
                                </th>
                                <th class="text-end sortable" @click="sortBy('memory')">
                                    {{ $t("pm2Memory") }} <SortIcon :col="'memory'" :sort-key="sortKey" :sort-dir="sortDir" />
                                </th>
                                <th v-if="state.hasGpu" class="text-end sortable" @click="sortBy('gpuPercent')">
                                    {{ $t("gpu") }} <SortIcon :col="'gpuPercent'" :sort-key="sortKey" :sort-dir="sortDir" />
                                </th>
                                <th class="text-end sortable" @click="sortBy('uptime')">
                                    {{ $t("pm2Uptime") }} <SortIcon :col="'uptime'" :sort-key="sortKey" :sort-dir="sortDir" />
                                </th>
                                <th class="text-end sortable" @click="sortBy('restarts')">
                                    {{ $t("pm2Restarts") }} <SortIcon :col="'restarts'" :sort-key="sortKey" :sort-dir="sortDir" />
                                </th>
                                <th class="text-end sortable" @click="sortBy('pid')">
                                    {{ $t("pm2Pid") }} <SortIcon :col="'pid'" :sort-key="sortKey" :sort-dir="sortDir" />
                                </th>
                                <th class="text-end">{{ $t("pm2Actions") }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="p in sortedProcesses"
                                :key="p.pmId"
                                class="pm2-row"
                                :class="{ 'pm2-row-self': isSelf(p) }"
                                @click="goToDetail(p)"
                            >
                                <td class="text-muted">{{ p.pmId }}</td>
                                <td>
                                    <span class="pm2-name">{{ p.name }}</span>
                                    <span v-if="isSelf(p)" class="badge pm2-self-badge ms-2">self</span>
                                </td>
                                <td>
                                    <span class="pm2-status" :class="statusClass(p.status)">
                                        <span class="pm2-status-dot"></span>
                                        {{ p.status }}
                                    </span>
                                </td>
                                <td class="text-end">
                                    <div class="metric-cell">
                                        <span class="metric-value">{{ p.cpu }}%</span>
                                        <div class="metric-bar">
                                            <div class="metric-fill cpu" :style="{ width: Math.min(p.cpu, 100) + '%' }"></div>
                                        </div>
                                    </div>
                                </td>
                                <td class="text-end">
                                    <div class="metric-cell">
                                        <span class="metric-value">{{ formatMemory(p.memory) }}</span>
                                        <div class="metric-bar">
                                            <div class="metric-fill mem" :style="{ width: memoryPercent(p.memory) + '%' }"></div>
                                        </div>
                                    </div>
                                </td>
                                <td v-if="state.hasGpu" class="text-end">
                                    <div class="metric-cell">
                                        <span class="metric-value">{{ (p.gpuPercent || 0).toFixed(1) }}% · {{ p.gpuVramMb || 0 }}MB</span>
                                        <div class="metric-bar">
                                            <div class="metric-fill gpu" :style="{ width: Math.min(p.gpuPercent || 0, 100) + '%' }"></div>
                                        </div>
                                    </div>
                                </td>
                                <td class="text-end text-nowrap pm2-mono">{{ formatUptime(p.uptime) }}</td>
                                <td class="text-end pm2-mono" :class="{ 'text-warning': p.restarts > 0, 'text-danger': p.unstableRestarts > 0 }">
                                    {{ p.restarts }}
                                </td>
                                <td class="text-end text-muted pm2-mono">{{ p.pid || "-" }}</td>
                                <td class="text-end text-nowrap action-cell" @click.stop>
                                    <button
                                        class="btn btn-sm btn-outline-normal me-1 action-btn"
                                        :disabled="busy[p.name] || p.status !== 'online'"
                                        :title="$t('Restart')"
                                        @click="onRestart(p)"
                                    >
                                        <font-awesome-icon icon="sync" :spin="busy[p.name] === 'restart'" />
                                    </button>
                                    <button
                                        v-if="p.status === 'online'"
                                        class="btn btn-sm btn-outline-normal action-btn action-btn-danger"
                                        :disabled="!!busy[p.name]"
                                        :title="$t('Stop')"
                                        @click="onStop(p)"
                                    >
                                        <font-awesome-icon icon="stop" />
                                    </button>
                                    <button
                                        v-else
                                        class="btn btn-sm btn-outline-normal action-btn action-btn-success"
                                        :disabled="!!busy[p.name]"
                                        :title="$t('Start')"
                                        @click="onStart(p)"
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

export default {
    components: { SortIcon },
    inject: [ "pm2State", "pm2Refresh", "pm2Action", "pm2SetAutoRefresh" ],
    data() {
        return {
            sortKey: "name",
            sortDir: "asc",
            busy: {},
        };
    },
    computed: {
        state() {
            return this.pm2State;
        },
        sortedProcesses() {
            const list = [ ...this.state.list ];
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
    },
    methods: {
        sortBy(key) {
            if (this.sortKey === key) {
                this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
            } else {
                this.sortKey = key;
                this.sortDir = "asc";
            }
        },
        onAutoToggle() {
            this.pm2SetAutoRefresh(this.state.autoRefresh);
        },
        goToDetail(p) {
            this.$router.push(`/pm2/${encodeURIComponent(p.name)}`);
        },
        statusClass(status) {
            switch (status) {
                case "online":
                    return "pm2-status-online";
                case "stopped":
                case "stopping":
                    return "pm2-status-stopped";
                case "errored":
                    return "pm2-status-error";
                case "launching":
                case "one-launch-status":
                    return "pm2-status-launching";
                default:
                    return "pm2-status-other";
            }
        },
        formatMemory(bytes) {
            if (!bytes) {
                return "0 B";
            }
            const units = [ "B", "KB", "MB", "GB" ];
            let v = bytes;
            let i = 0;
            while (v >= 1024 && i < units.length - 1) {
                v /= 1024;
                i++;
            }
            return v.toFixed(v >= 100 ? 0 : 1) + " " + units[i];
        },
        memoryPercent(bytes) {
            const ceiling = 1024 * 1024 * 1024;
            return Math.min((bytes / ceiling) * 100, 100);
        },
        formatUptime(ms) {
            if (!ms || ms < 0) {
                return "-";
            }
            const s = Math.floor(ms / 1000);
            const d = Math.floor(s / 86400);
            const h = Math.floor((s % 86400) / 3600);
            const m = Math.floor((s % 3600) / 60);
            const sec = s % 60;
            if (d > 0) {
                return `${d}d ${h}h`;
            }
            if (h > 0) {
                return `${h}h ${m}m`;
            }
            if (m > 0) {
                return `${m}m ${sec}s`;
            }
            return `${sec}s`;
        },
        isSelf(p) {
            return p.name === "dockge";
        },
        async onRestart(p) {
            const msg = this.isSelf(p)
                ? this.$t("pm2RestartSelfWarning") + "\n\n" + this.$t("pm2RestartConfirm", [ p.name ])
                : this.$t("pm2RestartConfirm", [ p.name ]);
            if (!window.confirm(msg)) {
                return;
            }
            this.busy[p.name] = "restart";
            await this.pm2Action(p.name, "restart");
            delete this.busy[p.name];
        },
        async onStop(p) {
            const msg = this.isSelf(p)
                ? this.$t("pm2StopSelfWarning")
                : this.$t("pm2StopConfirm", [ p.name ]);
            if (!window.confirm(msg)) {
                return;
            }
            this.busy[p.name] = "stop";
            await this.pm2Action(p.name, "stop");
            delete this.busy[p.name];
        },
        async onStart(p) {
            this.busy[p.name] = "start";
            await this.pm2Action(p.name, "start");
            delete this.busy[p.name];
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.pm2-table-box {
    padding: 0;
    overflow: hidden;
    border-radius: 10px;
}

.pm2-error {
    color: #842029;
    background-color: #f8d7da;
    border-left: 3px solid $danger;

    .dark & {
        color: #f87171;
        background-color: rgba(220, 53, 69, 0.12);
    }
}

.no-processes {
    color: #6c757d;

    .dark & {
        color: $dark-font-color3;
    }
}

.pm2-table {
    margin-bottom: 0;
    // Let cells inherit the shadow-box / page background instead of forcing white.
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
        transition: color 0.15s ease;

        &:hover {
            color: $primary;
        }
    }

    .sort-icon {
        margin-left: 4px;
        color: $primary;
        font-size: 0.9rem;
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

.pm2-row {
    cursor: pointer;
    transition: background-color 0.15s ease;

    &:hover {
        background-color: rgba(116, 194, 255, 0.06);
    }

    &.pm2-row-self {
        background-color: rgba(116, 194, 255, 0.04);
    }
}

.pm2-name {
    font-weight: 600;
    color: #111;
}

.pm2-self-badge {
    background-color: $primary;
    color: white;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.pm2-mono {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
}

.pm2-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    text-transform: capitalize;

    .pm2-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    &.pm2-status-online {
        color: #198754;

        .pm2-status-dot {
            background-color: #198754;
            box-shadow: 0 0 0 3px rgba(25, 135, 84, 0.15);
        }
    }

    &.pm2-status-stopped {
        color: #6c757d;

        .pm2-status-dot {
            background-color: #6c757d;
        }
    }

    &.pm2-status-error {
        color: $danger;

        .pm2-status-dot {
            background-color: $danger;
            box-shadow: 0 0 0 3px rgba(220, 53, 69, 0.15);
        }
    }

    &.pm2-status-launching, &.pm2-status-other {
        color: $warning;

        .pm2-status-dot {
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
    .pm2-table {
        color: $dark-font-color;

        th {
            color: $dark-font-color3;
            background-color: rgba(255, 255, 255, 0.02);
            border-bottom-color: $dark-border-color;
        }

        .sort-icon-inactive {
            color: rgba(255, 255, 255, 0.2);
        }

        td, th {
            border-color: rgba(255, 255, 255, 0.04);
        }
    }

    .pm2-row {
        &:hover {
            background-color: rgba(116, 194, 255, 0.08);
        }

        &.pm2-row-self {
            background-color: rgba(116, 194, 255, 0.05);
        }
    }

    .pm2-name {
        color: $dark-font-color;
    }

    .pm2-self-badge {
        color: $dark-font-color2;
    }

    .pm2-status {
        &.pm2-status-online {
            color: #4ade80;

            .pm2-status-dot {
                background-color: #4ade80;
                box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.12);
            }
        }

        &.pm2-status-stopped {
            color: $dark-font-color3;

            .pm2-status-dot {
                background-color: $dark-font-color3;
            }
        }

        &.pm2-status-error {
            color: #f87171;

            .pm2-status-dot {
                background-color: #f87171;
            }
        }
    }

    .metric-bar {
        background-color: rgba(255, 255, 255, 0.06);
    }
}

@media (max-width: 768px) {
    .pm2-table {
        td, th {
            padding: 0.55rem 0.6rem;
        }
    }
}

.toolbar {
    .mobile-sort {
        display: inline-flex;
        align-items: center;
        gap: 6px;

        .sort-key-select {
            width: auto;
            min-width: 110px;
            font-size: 0.85rem;
        }

        .sort-dir-btn {
            width: 34px;
            padding: 4px 0;
            font-weight: 600;
        }
    }
}

.pm2-cards {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.pm2-card {
    padding: 14px;
    cursor: pointer;
    transition: transform 0.12s ease, background-color 0.15s ease;

    &:active {
        transform: scale(0.99);
        background-color: rgba(116, 194, 255, 0.06);
    }

    &.pm2-card-self {
        border-left: 3px solid $primary;
    }

    .pm2-card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 10px;
    }

    .pm2-card-title {
        display: inline-flex;
        align-items: center;
        flex: 1 1 auto;
        min-width: 0;
        gap: 6px;

        .pm2-id {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.78rem;
        }

        .pm2-name {
            font-weight: 600;
            font-size: 1rem;
            color: #111;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    }

    .pm2-card-metrics {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
        margin-bottom: 10px;

        .metric-tile {
            background-color: rgba(0, 0, 0, 0.025);
            border-radius: 8px;
            padding: 6px 10px;

            .metric-tile-label {
                font-size: 0.65rem;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: #6c757d;
                margin-bottom: 2px;
            }

            .metric-tile-value {
                font-size: 0.95rem;
                font-weight: 600;
                font-variant-numeric: tabular-nums;
                color: #111;

                .unit {
                    font-size: 0.7rem;
                    font-weight: 400;
                    color: #6c757d;
                    margin-left: 2px;
                }
            }

            .metric-bar {
                margin-top: 4px;
                height: 3px;
                background-color: rgba(0, 0, 0, 0.06);
                border-radius: 2px;
                overflow: hidden;

                .metric-fill {
                    height: 100%;
                    transition: width 0.4s $easing-out;

                    &.cpu { background: $primary-gradient; }
                    &.mem { background: linear-gradient(135deg, #86e6a9 0%, #74c2ff 100%); }
                    &.gpu { background: linear-gradient(135deg, #ff9966 0%, #ff5e62 100%); }
                }
            }
        }
    }

    .pm2-card-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;

        .mobile-action-btn {
            min-height: 44px;
            font-size: 0.85rem;
            font-weight: 500;
            display: inline-flex;
            align-items: center;
            justify-content: center;

            &.action-btn-danger {
                color: $danger;
                border-color: rgba(220, 53, 69, 0.3);
            }

            &.action-btn-success {
                color: #198754;
                border-color: rgba(25, 135, 84, 0.3);
            }
        }
    }
}

.dark .pm2-card {
    .pm2-name {
        color: $dark-font-color;
    }

    &:active {
        background-color: rgba(116, 194, 255, 0.08);
    }

    .pm2-card-metrics .metric-tile {
        background-color: rgba(255, 255, 255, 0.03);

        .metric-tile-label, .unit {
            color: $dark-font-color3;
        }

        .metric-tile-value {
            color: $dark-font-color;
        }

        .metric-bar {
            background-color: rgba(255, 255, 255, 0.06);
        }
    }
}
</style>
