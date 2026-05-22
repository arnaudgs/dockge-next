<template>
    <div :class="classes">
        <div v-if="! $root.socketIO.connected && ! $root.socketIO.firstConnect" class="lost-connection">
            <div class="container-fluid">
                {{ $root.socketIO.connectionErrorMsg }}
                <div v-if="$root.socketIO.showReverseProxyGuide">
                    {{ $t("reverseProxyMsg1") }} <a href="https://github.com/louislam/uptime-kuma/wiki/Reverse-Proxy" target="_blank">{{ $t("reverseProxyMsg2") }}</a>
                </div>
            </div>
        </div>

        <!-- Desktop header -->
        <header v-if="! $root.isMobile" class="d-flex flex-wrap justify-content-center py-3 mb-3 border-bottom">
            <router-link :to="logoLink" class="d-flex align-items-center mb-3 mb-md-0 text-dark text-decoration-none">
                <object class="bi me-2 ms-4" width="40" height="40" data="/icon.svg" />
                <span class="fs-4 title">Dockge</span>
            </router-link>

            <div v-if="$root.loggedIn" class="mode-switcher ms-3 me-md-auto">
                <router-link to="/" class="mode-btn" :class="{ active: !isPm2Mode }">
                    <font-awesome-icon icon="layer-group" class="me-1" />
                    {{ $t("modeDockge") }}
                </router-link>
                <router-link to="/pm2" class="mode-btn" :class="{ active: isPm2Mode }">
                    <font-awesome-icon icon="microchip" class="me-1" />
                    {{ $t("modePm2") }}
                </router-link>
            </div>

            <a v-if="hasNewVersion" target="_blank" href="https://github.com/louislam/dockge/releases" class="btn btn-warning me-3">
                <font-awesome-icon icon="arrow-alt-circle-up" /> {{ $t("newUpdate") }}
            </a>

            <ul class="nav nav-pills">
                <li v-if="$root.loggedIn" class="nav-item me-2">
                    <router-link :to="homeLink" class="nav-link">
                        <font-awesome-icon :icon="isPm2Mode ? 'layer-group' : 'home'" />
                        {{ isPm2Mode ? $t("pm2Overview") : $t("home") }}
                    </router-link>
                </li>

                <li v-if="$root.loggedIn && !isPm2Mode" class="nav-item me-2">
                    <router-link to="/stacks" class="nav-link">
                        <font-awesome-icon icon="layer-group" /> {{ $t("stacksOverview") }}
                    </router-link>
                </li>

                <li v-if="$root.loggedIn && !isPm2Mode" class="nav-item me-2">
                    <router-link to="/updates" class="nav-link">
                        <font-awesome-icon icon="circle-up" /> {{ $t("updates") }}
                        <span v-if="updateCount > 0" class="badge bg-danger ms-1">{{ updateCount }}</span>
                    </router-link>
                </li>

                <li v-if="$root.loggedIn && !isPm2Mode" class="nav-item me-2">
                    <router-link to="/console" class="nav-link">
                        <font-awesome-icon icon="terminal" /> {{ $t("console") }}
                    </router-link>
                </li>

                <li v-if="$root.loggedIn" class="nav-item">
                    <div class="dropdown dropdown-profile-pic">
                        <div class="nav-link" data-bs-toggle="dropdown">
                            <div class="profile-pic">{{ $root.usernameFirstChar }}</div>
                            <font-awesome-icon icon="angle-down" />
                        </div>

                        <!-- Header's Dropdown Menu -->
                        <ul class="dropdown-menu">
                            <!-- Username -->
                            <li>
                                <i18n-t v-if="$root.username != null" tag="span" keypath="signedInDisp" class="dropdown-item-text">
                                    <strong>{{ $root.username }}</strong>
                                </i18n-t>
                                <span v-if="$root.username == null" class="dropdown-item-text">{{ $t("signedInDispDisabled") }}</span>
                            </li>

                            <li><hr class="dropdown-divider"></li>

                            <!-- Functions -->

                            <!--<li>
                                <router-link to="/registry" class="dropdown-item" :class="{ active: $route.path.includes('settings') }">
                                    <font-awesome-icon icon="warehouse" /> {{ $t("registry") }}
                                </router-link>
                            </li>-->

                            <li v-if="!isPm2Mode">
                                <button class="dropdown-item" @click="scanFolder">
                                    <font-awesome-icon icon="arrows-rotate" /> {{ $t("scanFolder") }}
                                </button>
                            </li>

                            <li>
                                <router-link to="/settings/general" class="dropdown-item" :class="{ active: $route.path.includes('settings') }">
                                    <font-awesome-icon icon="cog" /> {{ $t("Settings") }}
                                </router-link>
                            </li>

                            <li>
                                <button class="dropdown-item" @click="$root.logout">
                                    <font-awesome-icon icon="sign-out-alt" />
                                    {{ $t("Logout") }}
                                </button>
                            </li>
                        </ul>
                    </div>
                </li>
            </ul>
        </header>

        <!-- Mobile slim top bar -->
        <header v-if="$root.isMobile && $root.loggedIn" class="mobile-topbar">
            <button v-if="showBackButton" class="topbar-back" :title="$t('back') || 'Back'" @click="goBack">
                <font-awesome-icon icon="angle-left" />
            </button>
            <router-link v-else :to="homeLink" class="topbar-logo">
                <object class="bi" width="24" height="24" data="/icon.svg" />
            </router-link>

            <h1 class="topbar-title">{{ mobileTitle }}</h1>

            <div class="dropdown topbar-profile">
                <button class="profile-btn" data-bs-toggle="dropdown" aria-expanded="false">
                    <div class="profile-pic">{{ $root.usernameFirstChar }}</div>
                </button>
                <ul class="dropdown-menu dropdown-menu-end">
                    <li>
                        <i18n-t v-if="$root.username != null" tag="span" keypath="signedInDisp" class="dropdown-item-text">
                            <strong>{{ $root.username }}</strong>
                        </i18n-t>
                        <span v-if="$root.username == null" class="dropdown-item-text">{{ $t("signedInDispDisabled") }}</span>
                    </li>
                    <li><hr class="dropdown-divider"></li>
                    <li v-if="!isPm2Mode">
                        <button class="dropdown-item" @click="scanFolder">
                            <font-awesome-icon icon="arrows-rotate" /> {{ $t("scanFolder") }}
                        </button>
                    </li>
                    <li>
                        <router-link to="/settings/general" class="dropdown-item">
                            <font-awesome-icon icon="cog" /> {{ $t("Settings") }}
                        </router-link>
                    </li>
                    <li v-if="$root.socketIO.token !== 'autoLogin'">
                        <button class="dropdown-item" @click="$root.logout">
                            <font-awesome-icon icon="sign-out-alt" /> {{ $t("Logout") }}
                        </button>
                    </li>
                </ul>
            </div>
        </header>

        <main :class="{ 'mobile-main': $root.isMobile }">
            <div v-if="$root.socketIO.connecting" class="container mt-5">
                <h4>{{ $t("connecting...") }}</h4>
            </div>

            <router-view v-if="$root.loggedIn" />
            <Login v-if="! $root.loggedIn && $root.allowLoginDialog" />
        </main>

        <!-- Mobile bottom navigation -->
        <nav v-if="$root.isMobile && $root.loggedIn" class="bottom-nav">
            <template v-if="!isPm2Mode">
                <router-link to="/" class="bottom-nav-item" exact-active-class="active">
                    <div><font-awesome-icon icon="home" /></div>
                    {{ $t("home") }}
                </router-link>
                <a class="bottom-nav-item" :class="{ active: $root.showMobileStackList }" @click.prevent="$root.showMobileStackList = !$root.showMobileStackList">
                    <div><font-awesome-icon icon="layer-group" /></div>
                    {{ $t("Stacks") }}
                </a>
                <router-link to="/updates" class="bottom-nav-item" active-class="active">
                    <div class="update-icon-wrapper">
                        <font-awesome-icon icon="circle-up" />
                        <span v-if="updateCount > 0" class="mobile-update-badge">{{ updateCount }}</span>
                    </div>
                    {{ $t("updates") }}
                </router-link>
                <router-link to="/console" class="bottom-nav-item" active-class="active">
                    <div><font-awesome-icon icon="terminal" /></div>
                    {{ $t("console") }}
                </router-link>
                <router-link to="/settings/general" class="bottom-nav-item" active-class="active">
                    <div><font-awesome-icon icon="cog" /></div>
                    {{ $t("Settings") }}
                </router-link>
                <router-link to="/pm2" class="bottom-nav-item mode-switch-item" active-class="active">
                    <div><font-awesome-icon icon="microchip" /></div>
                    {{ $t("modePm2") }}
                </router-link>
            </template>
            <template v-else>
                <router-link to="/pm2" class="bottom-nav-item" exact-active-class="active">
                    <div><font-awesome-icon icon="layer-group" /></div>
                    {{ $t("pm2Overview") }}
                </router-link>
                <a class="bottom-nav-item" :class="{ active: $root.showMobilePm2List }" @click.prevent="$root.showMobilePm2List = !$root.showMobilePm2List">
                    <div><font-awesome-icon icon="microchip" /></div>
                    {{ $t("pm2Processes") }}
                </a>
                <router-link to="/settings/general" class="bottom-nav-item" active-class="active">
                    <div><font-awesome-icon icon="cog" /></div>
                    {{ $t("Settings") }}
                </router-link>
                <router-link to="/" class="bottom-nav-item mode-switch-item">
                    <div><font-awesome-icon icon="home" /></div>
                    {{ $t("modeDockge") }}
                </router-link>
            </template>
        </nav>
    </div>
</template>

<script>
import Login from "../components/Login.vue";
import { compareVersions } from "compare-versions";
import { ALL_ENDPOINTS } from "../../../common/util-common";

export default {

    components: {
        Login,
    },

    data() {
        return {

        };
    },

    computed: {

        // Theme or Mobile
        classes() {
            const classes = {};
            classes[this.$root.theme] = true;
            classes["mobile"] = this.$root.isMobile;
            return classes;
        },

        isPm2Mode() {
            return this.$route.path.startsWith("/pm2");
        },

        logoLink() {
            return this.isPm2Mode ? "/pm2" : "/";
        },

        homeLink() {
            return this.isPm2Mode ? "/pm2" : "/";
        },

        updateCount() {
            return Object.values(this.$root.completeStackList).filter(
                s => s.updates && s.updates.length > 0
            ).length;
        },

        hasNewVersion() {
            if (this.$root.info.latestVersion && this.$root.info.version) {
                return compareVersions(this.$root.info.latestVersion, this.$root.info.version) >= 1;
            } else {
                return false;
            }
        },

        mobileTitle() {
            const route = this.$route;
            const path = route.path;
            const params = route.params || {};

            if (path.startsWith("/compose/") && params.stackName) {
                try {
                    return decodeURIComponent(params.stackName);
                } catch (e) {
                    return params.stackName;
                }
            }
            if (path === "/compose") {
                return this.$t("compose");
            }
            if (path.startsWith("/pm2/") && params.name) {
                try {
                    return decodeURIComponent(params.name);
                } catch (e) {
                    return params.name;
                }
            }
            if (path === "/pm2") {
                return this.$t("pm2Overview");
            }
            if (path.startsWith("/terminal/")) {
                return params.serviceName || this.$t("terminal");
            }
            if (path === "/console" || path.startsWith("/console/")) {
                return this.$t("console");
            }
            if (path === "/updates") {
                return this.$t("updates");
            }
            if (path === "/stacks") {
                return this.$t("stacksOverview");
            }
            if (path.startsWith("/settings")) {
                return this.$t("Settings");
            }
            if (path === "/") {
                return this.$t("home");
            }
            return "Dockge";
        },

        showBackButton() {
            const path = this.$route.path;
            return path.startsWith("/compose")
                || (path.startsWith("/pm2/") && path !== "/pm2")
                || path.startsWith("/terminal/");
        },

    },

    watch: {

    },

    mounted() {

    },

    beforeUnmount() {

    },

    methods: {
        scanFolder() {
            this.$root.emitAgent(ALL_ENDPOINTS, "requestStackList", (res) => {
                this.$root.toastRes(res);
            });
        },
        goBack() {
            if (window.history.length > 1) {
                this.$router.back();
            } else {
                this.$router.push(this.homeLink);
            }
        },
    },

};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.nav-link {
    &.status-page {
        background-color: rgba(255, 255, 255, 0.1);
    }
}

.bottom-nav {
    z-index: 1060;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: calc(60px + env(safe-area-inset-bottom));
    background-color: #fff;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
    display: flex;
    padding: 0 0 env(safe-area-inset-bottom);

    .bottom-nav-item {
        text-align: center;
        flex: 1 1 0;
        min-width: 0;

        &.mode-switch-item {
            position: relative;
            color: $primary;

            div {
                color: $primary;
            }

            &::before {
                content: "";
                position: absolute;
                left: 4px;
                top: 12px;
                bottom: 12px;
                width: 1px;
                background-color: rgba(0, 0, 0, 0.1);
            }
        }
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        padding: 6px 2px 0;
        font-size: 11px;
        color: #c1c1c1;
        overflow: hidden;
        text-decoration: none;
        cursor: pointer;
        line-height: 1.2;
        white-space: nowrap;
        text-overflow: ellipsis;

        @media (max-width: 380px) {
            font-size: 10px;
            padding: 6px 1px 0;
        }

        &.router-link-exact-active, &.active {
            color: $primary;
            font-weight: bold;
        }

        div {
            font-size: 18px;
            margin-bottom: 2px;
        }
    }
}

.update-icon-wrapper {
    position: relative;
    display: inline-block;
}

.mobile-update-badge {
    position: absolute;
    top: -6px;
    right: -10px;
    background-color: #dc3545;
    color: #fff;
    border-radius: 50%;
    font-size: 9px;
    min-width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    line-height: 1;
}

main {
    min-height: calc(100vh - 160px);

    &.mobile-main {
        min-height: 0;
        padding-top: calc(52px + env(safe-area-inset-top));
        padding-bottom: calc(70px + env(safe-area-inset-bottom));
    }
}

.mobile-topbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1055;
    height: calc(52px + env(safe-area-inset-top));
    padding: env(safe-area-inset-top) 10px 0;
    background-color: #fff;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);

    .dark & {
        background-color: $dark-header-bg;
        border-bottom-color: $dark-border-color;
    }

    .topbar-back, .topbar-logo, .profile-btn {
        background: transparent;
        border: 0;
        padding: 6px 8px;
        color: inherit;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        min-width: 36px;
        min-height: 36px;
        cursor: pointer;
        text-decoration: none;
    }

    .topbar-back {
        font-size: 22px;
    }

    .topbar-title {
        flex: 1 1 auto;
        font-size: 1.05rem;
        font-weight: 600;
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;

        .dark & {
            color: $dark-font-color;
        }
    }

    .topbar-profile {
        .profile-pic {
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            background-color: $primary;
            width: 30px;
            height: 30px;
            border-radius: 50rem;
            font-weight: bold;
            font-size: 12px;
        }

        .dropdown-menu {
            transition: all 0.2s;
            border-radius: 12px;
            overflow: hidden;
            margin-top: 8px;

            .dark & {
                background-color: $dark-bg;
                color: $dark-font-color;
                border-color: $dark-border-color;

                .dropdown-item {
                    color: $dark-font-color;

                    &:hover {
                        background-color: $dark-bg2;
                    }
                }

                .dropdown-item-text {
                    color: $dark-font-color;
                }
            }

            .dropdown-item {
                padding: 0.6rem 1rem;
            }
        }
    }
}

.title {
    font-weight: bold;
}

.nav {
    margin-right: 25px;
}

.lost-connection {
    padding: calc(5px + env(safe-area-inset-top)) 5px 5px;
    background-color: crimson;
    color: white;
    position: fixed;
    width: 100%;
    z-index: 99999;
    top: 0;
}

.mode-switcher {
    display: inline-flex;
    padding: 4px;
    border-radius: 50rem;
    background-color: rgba(0, 0, 0, 0.04);
    gap: 2px;

    .mode-btn {
        display: inline-flex;
        align-items: center;
        padding: 6px 16px;
        border-radius: 50rem;
        font-size: 0.9rem;
        font-weight: 500;
        text-decoration: none;
        color: #555;
        transition: all 0.2s $easing-out;

        &:hover {
            color: $primary;
            background-color: rgba(116, 194, 255, 0.1);
        }

        &.active {
            color: white;
            background: $primary-gradient;
            box-shadow: 0 2px 8px rgba(116, 194, 255, 0.4);
        }
    }
}

.dark {
    .mode-switcher {
        background-color: rgba(255, 255, 255, 0.05);

        .mode-btn {
            color: $dark-font-color;

            &:hover {
                color: $primary;
                background-color: rgba(116, 194, 255, 0.12);
            }

            &.active {
                color: $dark-font-color2;
                box-shadow: 0 2px 8px rgba(116, 194, 255, 0.3);
            }
        }
    }
}

// Profile Pic Button with Dropdown
.dropdown-profile-pic {
    user-select: none;

    .nav-link {
        cursor: pointer;
        display: flex;
        gap: 6px;
        align-items: center;
        background-color: rgba(200, 200, 200, 0.2);
        padding: 0.5rem 0.8rem;

        &:hover {
            background-color: rgba(255, 255, 255, 0.2);
        }
    }

    .dropdown-menu {
        transition: all 0.2s;
        padding-left: 0;
        padding-bottom: 0;
        margin-top: 8px !important;
        border-radius: 16px;
        overflow: hidden;

        .dropdown-divider {
            margin: 0;
            border-top: 1px solid rgba(0, 0, 0, 0.4);
            background-color: transparent;
        }

        .dropdown-item-text {
            font-size: 14px;
            padding-bottom: 0.7rem;
        }

        .dropdown-item {
            padding: 0.7rem 1rem;
        }

        .dark & {
            background-color: $dark-bg;
            color: $dark-font-color;
            border-color: $dark-border-color;

            .dropdown-item {
                color: $dark-font-color;

                &.active {
                    color: $dark-font-color2;
                    background-color: $highlight !important;
                }

                &:hover {
                    background-color: $dark-bg2;
                }
            }
        }
    }

    .profile-pic {
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        background-color: $primary;
        width: 24px;
        height: 24px;
        margin-right: 5px;
        border-radius: 50rem;
        font-weight: bold;
        font-size: 10px;
    }
}

.dark {
    header {
        background-color: $dark-header-bg;
        border-bottom-color: $dark-header-bg !important;

        span {
            color: #f0f6fc;
        }
    }

    .bottom-nav {
        background-color: $dark-bg;
    }
}
</style>
