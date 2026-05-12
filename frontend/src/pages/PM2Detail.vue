<template>
    <transition name="slide-fade" appear>
        <div v-if="process">
            <h1 class="mb-3 d-flex align-items-center flex-wrap gap-2">
                <font-awesome-icon icon="microchip" class="me-2 text-primary" />
                {{ process.name }}
                <span v-if="isSelf" class="badge pm2-self-badge">self</span>
                <span class="pm2-status ms-3" :class="statusClass">
                    <span class="pm2-status-dot"></span>
                    {{ process.status }}
                </span>
            </h1>

            <div class="mb-4 d-flex flex-wrap gap-2">
                <button
                    class="btn btn-primary"
                    :disabled="busy === 'restart' || process.status !== 'online'"
                    @click="onRestart"
                >
                    <font-awesome-icon icon="sync" :spin="busy === 'restart'" class="me-1" />
                    {{ $t("Restart") }}
                </button>

                <button
                    v-if="process.status === 'online'"
                    class="btn btn-danger"
                    :disabled="!!busy"
                    @click="onStop"
                >
                    <font-awesome-icon icon="stop" class="me-1" />
                    {{ $t("Stop") }}
                </button>

                <button
                    v-else
                    class="btn btn-info"
                    :disabled="!!busy"
                    @click="onStart"
                >
                    <font-awesome-icon icon="play" class="me-1" />
                    {{ $t("Start") }}
                </button>

                <router-link to="/pm2" class="btn btn-normal ms-auto">
                    <font-awesome-icon icon="layer-group" class="me-1" />
                    {{ $t("pm2Overview") }}
                </router-link>
            </div>

            <div class="row g-3 mb-4">
                <div class="col-6 col-md-3">
                    <div class="shadow-box big-padding stat-card">
                        <div class="stat-label">{{ $t("pm2Cpu") }}</div>
                        <div class="stat-value">{{ process.cpu }}<span class="stat-unit">%</span></div>
                        <div class="metric-bar mt-2">
                            <div class="metric-fill cpu" :style="{ width: Math.min(process.cpu, 100) + '%' }"></div>
                        </div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="shadow-box big-padding stat-card">
                        <div class="stat-label">{{ $t("pm2Memory") }}</div>
                        <div class="stat-value">{{ memoryValue }}<span class="stat-unit">{{ memoryUnit }}</span></div>
                        <div class="metric-bar mt-2">
                            <div class="metric-fill mem" :style="{ width: memoryPercent + '%' }"></div>
                        </div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="shadow-box big-padding stat-card">
                        <div class="stat-label">{{ $t("pm2Uptime") }}</div>
                        <div class="stat-value stat-mono">{{ formatUptime(process.uptime) }}</div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="shadow-box big-padding stat-card">
                        <div class="stat-label">{{ $t("pm2Restarts") }}</div>
                        <div class="stat-value stat-mono" :class="{ 'text-warning': process.restarts > 0, 'text-danger': process.unstableRestarts > 0 }">
                            {{ process.restarts }}
                        </div>
                        <div v-if="process.unstableRestarts > 0" class="small text-danger">
                            {{ process.unstableRestarts }} {{ $t("pm2Unstable") }}
                        </div>
                    </div>
                </div>
            </div>

            <div class="shadow-box big-padding">
                <h5 class="mb-3">{{ $t("pm2ProcessInfo") }}</h5>
                <dl class="row pm2-info">
                    <dt class="col-sm-4 col-lg-3">{{ $t("pm2Pid") }}</dt>
                    <dd class="col-sm-8 col-lg-9 pm2-mono">{{ process.pid || "—" }}</dd>

                    <dt class="col-sm-4 col-lg-3">PM2 ID</dt>
                    <dd class="col-sm-8 col-lg-9 pm2-mono">{{ process.pmId }}</dd>

                    <dt class="col-sm-4 col-lg-3">{{ $t("pm2NodeVersion") }}</dt>
                    <dd class="col-sm-8 col-lg-9 pm2-mono">{{ process.nodeVersion || "—" }}</dd>

                    <dt class="col-sm-4 col-lg-3">{{ $t("pm2AppVersion") }}</dt>
                    <dd class="col-sm-8 col-lg-9 pm2-mono">{{ process.version || "—" }}</dd>

                    <dt class="col-sm-4 col-lg-3">{{ $t("pm2ExecMode") }}</dt>
                    <dd class="col-sm-8 col-lg-9 pm2-mono">{{ process.execMode || "—" }}</dd>

                    <dt class="col-sm-4 col-lg-3">{{ $t("pm2User") }}</dt>
                    <dd class="col-sm-8 col-lg-9 pm2-mono">{{ process.user || "—" }}</dd>

                    <dt class="col-sm-4 col-lg-3">{{ $t("pm2Cwd") }}</dt>
                    <dd class="col-sm-8 col-lg-9 pm2-mono pm2-path">{{ process.cwd || "—" }}</dd>

                    <dt class="col-sm-4 col-lg-3">{{ $t("pm2Script") }}</dt>
                    <dd class="col-sm-8 col-lg-9 pm2-mono pm2-path">{{ process.scriptPath || "—" }}</dd>
                </dl>
            </div>
        </div>

        <div v-else class="shadow-box big-padding text-center text-muted">
            <font-awesome-icon icon="question-circle" class="me-2" />
            {{ $t("pm2NotFound", [routeName]) }}
            <div class="mt-3">
                <router-link to="/pm2" class="btn btn-normal">
                    <font-awesome-icon icon="layer-group" class="me-1" /> {{ $t("pm2Overview") }}
                </router-link>
            </div>
        </div>
    </transition>
</template>

<script>
export default {
    inject: [ "pm2State", "pm2Action" ],
    data() {
        return {
            busy: "",
        };
    },
    computed: {
        routeName() {
            return decodeURIComponent(this.$route.params.name || "");
        },
        process() {
            return this.pm2State.list.find((p) => p.name === this.routeName) || null;
        },
        isSelf() {
            return this.process && this.process.name === "dockge";
        },
        statusClass() {
            if (!this.process) {
                return "";
            }
            switch (this.process.status) {
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
        memoryValue() {
            const bytes = this.process?.memory || 0;
            return this.splitMemory(bytes).value;
        },
        memoryUnit() {
            const bytes = this.process?.memory || 0;
            return this.splitMemory(bytes).unit;
        },
        memoryPercent() {
            const bytes = this.process?.memory || 0;
            const ceiling = 1024 * 1024 * 1024;
            return Math.min((bytes / ceiling) * 100, 100);
        },
    },
    methods: {
        splitMemory(bytes) {
            if (!bytes) {
                return { value: "0", unit: " B" };
            }
            const units = [ "B", "KB", "MB", "GB" ];
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
        formatUptime(ms) {
            if (!ms || ms < 0) {
                return "—";
            }
            const s = Math.floor(ms / 1000);
            const d = Math.floor(s / 86400);
            const h = Math.floor((s % 86400) / 3600);
            const m = Math.floor((s % 3600) / 60);
            const sec = s % 60;
            if (d > 0) {
                return `${d}d ${h}h ${m}m`;
            }
            if (h > 0) {
                return `${h}h ${m}m`;
            }
            if (m > 0) {
                return `${m}m ${sec}s`;
            }
            return `${sec}s`;
        },
        async onRestart() {
            const msg = this.isSelf
                ? this.$t("pm2RestartSelfWarning") + "\n\n" + this.$t("pm2RestartConfirm", [ this.process.name ])
                : this.$t("pm2RestartConfirm", [ this.process.name ]);
            if (!window.confirm(msg)) {
                return;
            }
            this.busy = "restart";
            await this.pm2Action(this.process.name, "restart");
            this.busy = "";
        },
        async onStop() {
            const msg = this.isSelf
                ? this.$t("pm2StopSelfWarning")
                : this.$t("pm2StopConfirm", [ this.process.name ]);
            if (!window.confirm(msg)) {
                return;
            }
            this.busy = "stop";
            await this.pm2Action(this.process.name, "stop");
            this.busy = "";
        },
        async onStart() {
            this.busy = "start";
            await this.pm2Action(this.process.name, "start");
            this.busy = "";
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.text-primary {
    color: $primary !important;
}

.pm2-self-badge {
    background-color: $primary;
    color: white;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 4px 8px;
}

.pm2-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.95rem;
    font-weight: 500;
    text-transform: capitalize;

    .pm2-status-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    &.pm2-status-online {
        color: #198754;

        .pm2-status-dot {
            background-color: #198754;
            box-shadow: 0 0 0 4px rgba(25, 135, 84, 0.15);
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
            box-shadow: 0 0 0 4px rgba(220, 53, 69, 0.15);
        }
    }

    &.pm2-status-launching, &.pm2-status-other {
        color: $warning;

        .pm2-status-dot {
            background-color: $warning;
        }
    }
}

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
    font-size: 1.7rem;
    font-weight: 700;
    color: #111;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;

    .stat-unit {
        font-size: 0.95rem;
        font-weight: 400;
        color: #6c757d;
        margin-left: 4px;
    }
}

.stat-mono {
    font-family: 'JetBrains Mono', monospace;
    font-size: 1.3rem;
}

.metric-bar {
    width: 100%;
    height: 5px;
    background-color: rgba(0, 0, 0, 0.06);
    border-radius: 3px;
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
    }
}

.pm2-info {
    margin: 0;

    dt {
        font-weight: 600;
        font-size: 0.85rem;
        color: #6c757d;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        padding: 8px 0;
    }

    dd {
        padding: 8px 0;
        margin-bottom: 0;
        border-bottom: 1px solid rgba(0, 0, 0, 0.04);
        word-break: break-all;
    }

    .pm2-path {
        font-size: 0.85rem;
        color: #555;
    }
}

.pm2-mono {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
}

.dark {
    .stat-value {
        color: $dark-font-color;
    }

    .stat-unit {
        color: $dark-font-color3;
    }

    .stat-label {
        color: $dark-font-color3;
    }

    .metric-bar {
        background-color: rgba(255, 255, 255, 0.06);
    }

    .pm2-info {
        dt {
            color: $dark-font-color3;
        }

        dd {
            color: $dark-font-color;
            border-bottom-color: rgba(255, 255, 255, 0.05);
        }

        .pm2-path {
            color: $dark-font-color;
        }
    }

    .pm2-status {
        &.pm2-status-online {
            color: #4ade80;

            .pm2-status-dot {
                background-color: #4ade80;
                box-shadow: 0 0 0 4px rgba(74, 222, 128, 0.12);
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
}
</style>
