<template>
    <transition name="slide-fade" appear>
        <div>
            <h1 class="mb-3">
                <font-awesome-icon icon="layer-group" class="me-2" />
                {{ $t("stacksOverview") }}
                <span v-if="totals.totalStacks > 0" class="badge bg-secondary ms-2">{{ totals.totalStacks }}</span>
            </h1>

            <!-- Aggregate KPIs -->
            <div class="row g-3 mb-4">
                <div class="col-6 col-md-3">
                    <div class="shadow-box big-padding stat-card">
                        <div class="stat-label">{{ $t("runningStacks") }}</div>
                        <div class="stat-value">
                            {{ totals.runningCount }}<span class="stat-unit">/ {{ totals.totalStacks }}</span>
                        </div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="shadow-box big-padding stat-card">
                        <div class="stat-label">{{ $t("Container | Containers") }}</div>
                        <div class="stat-value stat-mono">{{ totals.totalContainers }}</div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="shadow-box big-padding stat-card">
                        <div class="stat-label">{{ $t("CPU") }}</div>
                        <div class="stat-value">{{ totals.totalCpu.toFixed(1) }}<span class="stat-unit">%</span></div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="shadow-box big-padding stat-card">
                        <div class="stat-label">{{ $t("memory") }}</div>
                        <div class="stat-value">{{ totalMemoryValue }}<span class="stat-unit">{{ totalMemoryUnit }}</span></div>
                    </div>
                </div>
            </div>

            <div v-if="totals.hasGpu" class="row g-3 mb-4">
                <div class="col-6 col-md-3">
                    <div class="shadow-box big-padding stat-card">
                        <div class="stat-label">{{ $t("gpuUsage") }}</div>
                        <div class="stat-value">{{ totals.totalGpuPercent.toFixed(1) }}<span class="stat-unit">%</span></div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="shadow-box big-padding stat-card">
                        <div class="stat-label">{{ $t("gpuMemory") }}</div>
                        <div class="stat-value">{{ totals.totalGpuVram }}<span class="stat-unit">MB</span></div>
                    </div>
                </div>
                <div class="col-12 col-md-6">
                    <div class="shadow-box big-padding stat-card">
                        <div class="stat-label">{{ $t("gpuCards") }}</div>
                        <div class="stat-value-sm">
                            <span v-for="(c, i) in totals.gpuCards" :key="i" class="gpu-card-chip">
                                {{ c.vendor }}<span v-if="c.pciId" class="text-muted"> · {{ c.pciId }}</span>
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <StacksOverviewTable @stats="onStats" />
        </div>
    </transition>
</template>

<script>
import StacksOverviewTable from "../components/StacksOverviewTable.vue";

export default {
    components: { StacksOverviewTable },
    data() {
        return {
            totals: {
                runningCount: 0,
                totalContainers: 0,
                totalCpu: 0,
                totalMemory: 0,
                totalGpuPercent: 0,
                totalGpuVram: 0,
                totalStacks: 0,
                hasGpu: false,
                gpuCards: [],
            },
        };
    },
    computed: {
        totalMemoryValue() {
            return this.splitBytes(this.totals.totalMemory).value;
        },
        totalMemoryUnit() {
            return this.splitBytes(this.totals.totalMemory).unit;
        },
    },
    methods: {
        onStats(s) {
            this.totals = s;
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

.dark {
    .stat-value, .stat-value-sm {
        color: $dark-font-color;
    }

    .stat-unit, .stat-label {
        color: $dark-font-color3;
    }
}
</style>
