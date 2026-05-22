<template>
    <div class="container-fluid pm2-dashboard">
        <div class="row">
            <div v-if="!$root.isMobile" class="col-12 col-md-4 col-xl-3">
                <PM2List />
            </div>

            <div class="col-12 mb-3" :class="{ 'col-md-8 col-xl-9': !$root.isMobile }">
                <router-view :key="$route.fullPath" />
            </div>
        </div>

        <!-- Mobile PM2 list offcanvas -->
        <div v-if="$root.isMobile" class="offcanvas offcanvas-start" :class="{ show: $root.showMobilePm2List }" tabindex="-1">
            <div class="offcanvas-header">
                <h5 class="offcanvas-title">
                    <font-awesome-icon icon="microchip" class="me-1" /> {{ $t("pm2Processes") }}
                </h5>
                <button type="button" class="btn-close" @click="$root.showMobilePm2List = false"></button>
            </div>
            <div class="offcanvas-body">
                <PM2List @item-click="$root.showMobilePm2List = false" />
            </div>
        </div>
        <div v-if="$root.isMobile && $root.showMobilePm2List" class="offcanvas-backdrop fade show" @click="$root.showMobilePm2List = false"></div>
    </div>
</template>

<script>
import { reactive } from "vue";
import PM2List from "../components/PM2List.vue";

const pm2State = reactive({
    list: [],
    loading: false,
    error: "",
    autoRefresh: true,
    hasGpu: false,
    gpuCards: [],
});

const REFRESH_INTERVAL_MS = 3000;

export default {
    components: { PM2List },
    provide() {
        return {
            pm2State,
            pm2Refresh: (silent) => this.refresh(silent),
            pm2Action: (name, kind) => this.action(name, kind),
            pm2SetAutoRefresh: (val) => this.setAutoRefresh(val),
        };
    },
    data() {
        return {
            timer: null,
        };
    },
    watch: {
        "$route.fullPath"() {
            this.$root.showMobilePm2List = false;
        },
    },
    mounted() {
        this.refresh();
        if (pm2State.autoRefresh) {
            this.startTimer();
        }
    },
    beforeUnmount() {
        this.stopTimer();
    },
    methods: {
        startTimer() {
            this.stopTimer();
            this.timer = setInterval(() => this.refresh(true), REFRESH_INTERVAL_MS);
        },
        stopTimer() {
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }
        },
        setAutoRefresh(val) {
            pm2State.autoRefresh = val;
            if (val) {
                this.startTimer();
            } else {
                this.stopTimer();
            }
        },
        refresh(silent = false) {
            if (!silent) {
                pm2State.loading = true;
            }
            this.$root.getSocket().emit("pm2List", (res) => {
                pm2State.loading = false;
                if (res && res.ok && Array.isArray(res.list)) {
                    pm2State.list = res.list;
                    pm2State.error = "";
                    pm2State.hasGpu = !!res.hasGpu;
                    pm2State.gpuCards = res.gpuCards || [];
                } else {
                    pm2State.error = (res && res.msg) ? res.msg : "PM2 unavailable";
                }
            });
        },
        action(name, kind) {
            return new Promise((resolve) => {
                const event = `pm2${kind.charAt(0).toUpperCase() + kind.slice(1)}`;
                this.$root.getSocket().emit(event, name, (res) => {
                    this.$root.toastRes(res);
                    this.refresh(true);
                    resolve(res);
                });
            });
        },
    },
};
</script>

<style lang="scss" scoped>
.container-fluid.pm2-dashboard {
    width: 98%;
}

@media (max-width: 768px) {
    .container-fluid.pm2-dashboard {
        width: 100%;
        padding-left: 8px;
        padding-right: 8px;
    }
}

.offcanvas {
    z-index: 1050;
    width: 85%;
    max-width: 350px;
    visibility: visible;
    transform: translateX(-100%);
    transition: transform 0.3s ease-in-out;
    background-color: var(--bs-body-bg);
    top: calc(52px + env(safe-area-inset-top));
    bottom: calc(60px + env(safe-area-inset-bottom));

    &.show {
        transform: translateX(0);
    }
}

.offcanvas-backdrop {
    z-index: 1040;
    top: calc(52px + env(safe-area-inset-top));
    bottom: calc(60px + env(safe-area-inset-bottom));
}

.dark .offcanvas {
    background-color: #0d1117;
    color: #b1b8c0;

    .btn-close {
        filter: invert(1);
    }
}
</style>
