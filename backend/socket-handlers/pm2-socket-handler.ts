import pm2 from "pm2";
import { SocketHandler } from "../socket-handler.js";
import { DockgeServer } from "../dockge-server";
import { callbackError, callbackResult, checkLogin, DockgeSocket } from "../util-server";
import { log } from "../log";

export interface PM2ProcessInfo {
    pmId : number;
    name : string;
    status : string;
    pid : number;
    cpu : number;
    memory : number;
    uptime : number | null;
    restarts : number;
    unstableRestarts : number;
    version : string | null;
    execMode : string | null;
    nodeVersion : string | null;
    user : string | null;
    cwd : string | null;
    scriptPath : string | null;
}

function pm2Connect() : Promise<void> {
    return new Promise((resolve, reject) => {
        pm2.connect((err) => {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
    });
}

function pm2List() : Promise<PM2ProcessInfo[]> {
    return new Promise((resolve, reject) => {
        pm2.list((err, list) => {
            if (err) {
                reject(err);
                return;
            }
            const now = Date.now();
            const result : PM2ProcessInfo[] = list.map((proc) => {
                const p = proc as unknown as Record<string, unknown>;
                const env = (p.pm2_env ?? {}) as Record<string, unknown>;
                const monit = (p.monit ?? {}) as Record<string, unknown>;
                const status = (env.status as string) ?? "unknown";
                const pmUptime = env.pm_uptime as number | undefined;
                const uptime = status === "online" && typeof pmUptime === "number"
                    ? now - pmUptime
                    : null;
                return {
                    pmId: (p.pm_id as number) ?? -1,
                    name: (p.name as string) ?? "",
                    status,
                    pid: (p.pid as number) ?? 0,
                    cpu: (monit.cpu as number) ?? 0,
                    memory: (monit.memory as number) ?? 0,
                    uptime,
                    restarts: (env.restart_time as number) ?? 0,
                    unstableRestarts: (env.unstable_restarts as number) ?? 0,
                    version: (env.version as string) ?? null,
                    execMode: (env.exec_mode as string) ?? null,
                    nodeVersion: (env.node_version as string) ?? null,
                    user: (env.username as string) ?? null,
                    cwd: (env.pm_cwd as string) ?? null,
                    scriptPath: (env.pm_exec_path as string) ?? null,
                };
            });
            resolve(result);
        });
    });
}

function pm2Action(action : "restart" | "stop" | "start", target : string | number) : Promise<void> {
    return new Promise((resolve, reject) => {
        const cb = (err : Error | null) => {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        };
        if (action === "restart") {
            pm2.restart(target as never, cb);
        } else if (action === "stop") {
            pm2.stop(target as never, cb);
        } else {
            pm2.start(target as never, cb);
        }
    });
}

let connected = false;
let connectPromise : Promise<void> | null = null;

async function ensureConnected() : Promise<void> {
    if (connected) {
        return;
    }
    if (!connectPromise) {
        connectPromise = pm2Connect().then(() => {
            connected = true;
        }).catch((err) => {
            connectPromise = null;
            throw err;
        });
    }
    await connectPromise;
}

export class PM2SocketHandler extends SocketHandler {
    create(socket : DockgeSocket, _server : DockgeServer) {

        socket.on("pm2List", async (callback) => {
            try {
                checkLogin(socket);
                await ensureConnected();
                const list = await pm2List();
                callbackResult({
                    ok: true,
                    list,
                }, callback);
            } catch (e) {
                log.warn("pm2", "pm2List failed: " + (e instanceof Error ? e.message : String(e)));
                callbackError(e, callback);
            }
        });

        const handleAction = async (action : "restart" | "stop" | "start", target : unknown, callback : unknown) => {
            try {
                checkLogin(socket);
                if (typeof target !== "string" && typeof target !== "number") {
                    throw new Error("Invalid PM2 target");
                }
                await ensureConnected();
                await pm2Action(action, target);
                callbackResult({
                    ok: true,
                    msg: `PM2 ${action} sent`,
                }, callback);
            } catch (e) {
                log.warn("pm2", `pm2${action} failed: ` + (e instanceof Error ? e.message : String(e)));
                callbackError(e, callback);
            }
        };

        socket.on("pm2Restart", (target, callback) => handleAction("restart", target, callback));
        socket.on("pm2Stop", (target, callback) => handleAction("stop", target, callback));
        socket.on("pm2Start", (target, callback) => handleAction("start", target, callback));
    }
}
