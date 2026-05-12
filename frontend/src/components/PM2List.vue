<template>
    <div class="shadow-box mb-3 pm2-sidebar">
        <div class="list-header">
            <router-link to="/pm2" class="btn btn-primary w-100 mb-2" :class="{ 'active-overview': isOverview }">
                <font-awesome-icon icon="layer-group" class="me-1" /> {{ $t("pm2Overview") }}
            </router-link>

            <div class="search-wrapper mb-2">
                <a v-if="searchText === ''" class="search-icon">
                    <font-awesome-icon icon="search" />
                </a>
                <a v-else class="search-icon" style="cursor: pointer" @click="searchText = ''">
                    <font-awesome-icon icon="times" />
                </a>
                <form @submit.prevent>
                    <input v-model="searchText" class="form-control search-input" :placeholder="$t('Search')" autocomplete="off" />
                </form>
            </div>

            <div v-if="state.error" class="small text-danger px-1 mb-2">
                <font-awesome-icon icon="exclamation-triangle" class="me-1" /> {{ state.error }}
            </div>
        </div>

        <div class="pm2-list scrollbar">
            <div v-if="!state.loading && filtered.length === 0" class="text-center text-muted small p-3">
                <font-awesome-icon icon="check" class="me-1" />
                {{ searchText ? $t("pm2NoMatch") : $t("pm2NoProcesses") }}
            </div>
            <PM2ListItem v-for="p in filtered" :key="p.pmId" :process="p" />
        </div>
    </div>
</template>

<script>
import PM2ListItem from "./PM2ListItem.vue";

export default {
    components: { PM2ListItem },
    inject: [ "pm2State" ],
    data() {
        return {
            searchText: "",
        };
    },
    computed: {
        state() {
            return this.pm2State;
        },
        isOverview() {
            return this.$route.path === "/pm2";
        },
        filtered() {
            const q = this.searchText.trim().toLowerCase();
            if (!q) {
                return this.state.list;
            }
            return this.state.list.filter((p) => p.name.toLowerCase().includes(q));
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.pm2-sidebar {
    padding: 10px;
}

.list-header {
    padding: 0 4px;
}

.search-wrapper {
    position: relative;

    .search-icon {
        position: absolute;
        top: 50%;
        right: 12px;
        transform: translateY(-50%);
        color: #6c757d;
        font-size: 0.85rem;
    }

    .search-input {
        padding-right: 32px;
        font-size: 0.9rem;
    }
}

.pm2-list {
    max-height: calc(100vh - 280px);
    overflow-y: auto;
    padding: 2px;
}

.btn-primary.active-overview {
    box-shadow: 0 0 0 2px rgba(116, 194, 255, 0.4);
}

.dark {
    .search-wrapper .search-icon {
        color: $dark-font-color3;
    }
}
</style>
