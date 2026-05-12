<template>
    <transition name="slide-fade" appear>
        <div>
            <h1 class="mb-3">
                <font-awesome-icon icon="microchip" class="me-2" />
                {{ $t("pm2Processes") }}
                <span class="badge bg-secondary ms-2">{{ processes.length }}</span>
            </h1>

            <div class="mb-3 d-flex flex-wrap align-items-center gap-2">
                <button class="btn btn-normal" :disabled="loading" @click="refresh">
                    <font-awesome-icon icon="sync" :spin="loading" class="me-1" />
                    {{ $t("Refresh") }}
                </button>

                <label class="form-check form-switch mb-0 ms-auto">
                    <input v-model="autoRefresh" class="form-check-input" type="checkbox" />
                    <span class="form-check-label">{{ $t("pm2RefreshInterval", [refreshIntervalSeconds]) }}</span>
                </label>
            </div>

            <div v-if="error" class="alert alert-danger" role="alert">
                <font-awesome-icon icon="exclamation-triangle" class="me-2" />
                {{ error }}
            </div>

            <div v-if="processes.length === 0 && !loading && !error" class="shadow-box big-padding text-center">
                <font-awesome-icon icon="check" class="me-2" />
                {{ $t("pm2NoProcesses") }}
            </div>

            <div v-if="processes.length > 0" class="shadow-box pm2-table-box">
                <div class="table-responsive">
                    <table class="table table-hover mb-0 align-middle">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>{{ $t("Name") }}</th>
                                <th>{{ $t("pm2Status") }}</th>
                                <th class="text-end">{{ $t("pm2Cpu") }}</th>
                                <th class="text-end">{{ $t("pm2Memory") }}</th>
                                <th class="text-end">{{ $t("pm2Uptime") }}</th>
                                <th class="text-end">{{ $t("pm2Restarts") }}</th>
                                <th class="text-end">{{ $t("pm2Pid") }}</th>
                                <th class="text-end">{{ $t("pm2Actions") }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="p in processes" :key="p.pmId" :class="{ 'self-process': isSelf(p) }">
                                <td class="text-muted">{{ p.pmId }}</td>
                                <td>
                                    <strong>{{ p.name }}</strong>
                                    <span v-if="isSelf(p)" class="badge bg-info ms-2">self</span>
                                    <div v-if="p.version || p.nodeVersion" class="small text-muted">
                                        <span v-if="p.version">v{{ p.version }}</span>
                                        <span v-if="p.nodeVersion" class="ms-2">{{ $t("pm2NodeVersion") }} {{ p.nodeVersion }}</span>
                                    </div>
                                </td>
                                <td>
                                    <span class="badge" :class="statusBadgeClass(p.status)">{{ p.status }}</span>
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
                                <td class="text-end text-nowrap">{{ formatUptime(p.uptime) }}</td>
                                <td class="text-end" :class="{ 'text-warning': p.restarts > 0, 'text-danger': p.unstableRestarts > 0 }">
                                    {{ p.restarts }}
                                    <span v-if="p.unstableRestarts > 0" class="small">({{ p.unstableRestarts }} unstable)</span>
                                </td>
                                <td class="text-end text-muted">{{ p.pid || "-" }}</td>
                                <td class="text-end text-nowrap">
                                    <button
                                        class="btn btn-sm btn-outline-warning me-1"
                                        :disabled="busy[p.name] || p.status !== 'online'"
                                        :title="$t('Restart')"
                                        @click="onRestart(p)"
                                    >
                                        <font-awesome-icon icon="sync" :spin="busy[p.name] === 'restart'" />
                                    </button>
                                    <button
                                        v-if="p.status === 'online'"
                                        class="btn btn-sm btn-outline-danger me-1"
                                        :disabled="!!busy[p.name]"
                                        :title="$t('Stop')"
                                        @click="onStop(p)"
                                    >
                                        <font-awesome-icon icon="stop" />
                                    </button>
                                    <button
                                        v-else
                                        class="btn btn-sm btn-outline-success me-1"
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
export default {
    data() {
        return {
            processes: [],
            loading: false,
            error: "",
            autoRefresh: true,
            refreshIntervalSeconds: 3,
            refreshTimer: null,
            busy: {},
        };
    },
    watch: {
        autoRefresh(val) {
            if (val) {
                this.startTimer();
            } else {
                this.stopTimer();
            }
        },
    },
    mounted() {
        this.refresh();
        if (this.autoRefresh) {
            this.startTimer();
        }
    },
    beforeUnmount() {
        this.stopTimer();
    },
    methods: {
        startTimer() {
            this.stopTimer();
            this.refreshTimer = setInterval(() => {
                this.refresh(true);
            }, this.refreshIntervalSeconds * 1000);
        },
        stopTimer() {
            if (this.refreshTimer) {
                clearInterval(this.refreshTimer);
                this.refreshTimer = null;
            }
        },
        refresh(silent = false) {
            if (!silent) {
                this.loading = true;
            }
            this.$root.getSocket().emit("pm2List", (res) => {
                this.loading = false;
                if (res && res.ok && Array.isArray(res.list)) {
                    this.processes = res.list;
                    this.error = "";
                } else {
                    this.error = res?.msg || "PM2 unavailable";
                }
            });
        },
        statusBadgeClass(status) {
            switch (status) {
                case "online":
                    return "bg-success";
                case "stopped":
                case "stopping":
                    return "bg-secondary";
                case "errored":
                    return "bg-danger";
                case "launching":
                case "one-launch-status":
                    return "bg-info";
                default:
                    return "bg-warning text-dark";
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
            // 1 GB as the visual ceiling — good enough for relative bar.
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
            const warn = this.isSelf(p)
                ? this.$t("pm2RestartSelfWarning") + "\n\n" + this.$t("pm2RestartConfirm", [ p.name ])
                : this.$t("pm2RestartConfirm", [ p.name ]);
            if (!window.confirm(warn)) {
                return;
            }
            this.busy[p.name] = "restart";
            this.$root.getSocket().emit("pm2Restart", p.name, (res) => {
                delete this.busy[p.name];
                this.$root.toastRes(res);
                this.refresh(true);
            });
        },
        async onStop(p) {
            const warn = this.isSelf(p)
                ? this.$t("pm2StopSelfWarning")
                : this.$t("pm2StopConfirm", [ p.name ]);
            if (!window.confirm(warn)) {
                return;
            }
            this.busy[p.name] = "stop";
            this.$root.getSocket().emit("pm2Stop", p.name, (res) => {
                delete this.busy[p.name];
                this.$root.toastRes(res);
                this.refresh(true);
            });
        },
        async onStart(p) {
            this.busy[p.name] = "start";
            this.$root.getSocket().emit("pm2Start", p.name, (res) => {
                delete this.busy[p.name];
                this.$root.toastRes(res);
                this.refresh(true);
            });
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.pm2-table-box {
    padding: 0;
    overflow: hidden;
}

.table {
    margin-bottom: 0;

    th {
        font-weight: 600;
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: #888;
        border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    }

    td, th {
        padding: 0.75rem 1rem;
    }
}

.self-process {
    background-color: rgba(13, 110, 253, 0.06);
}

.metric-cell {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-end;
    min-width: 80px;

    .metric-value {
        font-variant-numeric: tabular-nums;
        font-size: 0.9rem;
    }

    .metric-bar {
        margin-top: 2px;
        width: 70px;
        height: 4px;
        background-color: rgba(0, 0, 0, 0.08);
        border-radius: 2px;
        overflow: hidden;

        .metric-fill {
            height: 100%;
            transition: width 0.4s ease;

            &.cpu {
                background-color: #0d6efd;
            }

            &.mem {
                background-color: #20c997;
            }
        }
    }
}

.dark {
    .table {
        color: $dark-font-color;

        th {
            color: $dark-font-color2;
            border-bottom-color: $dark-border-color;
        }

        tbody tr:hover {
            background-color: rgba(255, 255, 255, 0.04);
        }
    }

    .self-process {
        background-color: rgba(13, 110, 253, 0.15);
    }

    .metric-bar {
        background-color: rgba(255, 255, 255, 0.1);
    }
}
</style>
