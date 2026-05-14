<template>
    <router-link :to="`/pm2/${process.name}`" class="pm2-item" active-class="active">
        <span class="status-dot" :class="statusClass"></span>
        <div class="title">
            <span class="name">{{ process.name }}</span>
            <span v-if="isSelf" class="badge self-badge ms-1">self</span>
        </div>
        <div class="metrics text-end pm2-mono">
            <div>{{ process.cpu }}% · {{ formattedMemory }}</div>
            <div v-if="hasGpuMetric" class="gpu-metric">
                <font-awesome-icon icon="microchip" class="me-1" />{{ (process.gpuPercent || 0).toFixed(1) }}% · {{ process.gpuVramMb || 0 }}MB
            </div>
        </div>
    </router-link>
</template>

<script>
export default {
    props: {
        process: {
            type: Object,
            required: true,
        },
    },
    computed: {
        isSelf() {
            return this.process.name === "dockge";
        },
        hasGpuMetric() {
            return (this.process.gpuVramMb || 0) > 0 || (this.process.gpuPercent || 0) > 0;
        },
        statusClass() {
            switch (this.process.status) {
                case "online":
                    return "status-online";
                case "stopped":
                case "stopping":
                    return "status-stopped";
                case "errored":
                    return "status-error";
                case "launching":
                case "one-launch-status":
                    return "status-launching";
                default:
                    return "status-other";
            }
        },
        formattedMemory() {
            const bytes = this.process.memory || 0;
            const units = [ "B", "KB", "MB", "GB" ];
            let v = bytes;
            let i = 0;
            while (v >= 1024 && i < units.length - 1) {
                v /= 1024;
                i++;
            }
            return v.toFixed(v >= 100 ? 0 : 1) + units[i];
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.pm2-item {
    text-decoration: none;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 46px;
    border-radius: 10px;
    transition: all ease-in-out 0.15s;
    width: 100%;
    padding: 6px 10px;
    color: inherit;

    &:hover {
        background-color: $highlight-white;
    }

    &.active {
        background-color: #cdf8f4;

        .name {
            font-weight: 600;
        }
    }

    .status-dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        flex-shrink: 0;

        &.status-online {
            background-color: #198754;
            box-shadow: 0 0 0 3px rgba(25, 135, 84, 0.18);
        }

        &.status-stopped {
            background-color: #6c757d;
        }

        &.status-error {
            background-color: $danger;
            box-shadow: 0 0 0 3px rgba(220, 53, 69, 0.18);
        }

        &.status-launching, &.status-other {
            background-color: $warning;
        }
    }

    .title {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 4px;
        overflow: hidden;

        .name {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    }

    .self-badge {
        background-color: $primary;
        color: white;
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 2px 5px;
    }

    .pm2-mono {
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        color: #6c757d;
        flex-shrink: 0;

        .gpu-metric {
            color: #d6534f;
            margin-top: 2px;
        }
    }
}

.dark {
    .pm2-item {
        color: $dark-font-color;

        &:hover {
            background-color: rgba(116, 194, 255, 0.08);
        }

        &.active {
            background-color: rgba(116, 194, 255, 0.18);
        }

        .pm2-mono {
            color: $dark-font-color3;
        }

        .self-badge {
            color: $dark-font-color2;
        }
    }
}
</style>
