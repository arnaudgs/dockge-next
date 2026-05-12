import { DockgeServer } from "./dockge-server";
import { Stack } from "./stack";
import { DockgeSocket } from "./util-server";
import { log } from "./log";

export type StackUpdateStatus = "pending" | "updating" | "done" | "error";

export interface StackUpdateProgress {
    name : string;
    status : StackUpdateStatus;
    error? : string;
}

export interface UpdateState {
    running : boolean;
    endpoint : string;
    total : number;
    index : number;
    current : string;
    items : Record<string, StackUpdateProgress>;
    startedAt : number | null;
    finishedAt : number | null;
}

/**
 * Owns the bulk update queue for a DockgeServer. The queue is fully driven
 * server-side: once start() has been called, the loop runs until completion
 * regardless of whether the originating client stays connected. Progress is
 * broadcast to every authenticated socket so any browser tab can follow along
 * (or sync via getState() when it opens).
 */
export class UpdateManager {

    private server : DockgeServer;
    private state : UpdateState = UpdateManager.emptyState();

    constructor(server : DockgeServer) {
        this.server = server;
    }

    private static emptyState() : UpdateState {
        return {
            running: false,
            endpoint: "",
            total: 0,
            index: 0,
            current: "",
            items: {},
            startedAt: null,
            finishedAt: null,
        };
    }

    isRunning() : boolean {
        return this.state.running;
    }

    getState() : UpdateState {
        return {
            ...this.state,
            items: { ...this.state.items },
        };
    }

    /**
     * Kick off a new update queue. Throws if one is already running.
     */
    start(names : string[], endpoint : string) : void {
        if (this.state.running) {
            throw new Error("An update is already running");
        }
        if (names.length === 0) {
            throw new Error("Stack list is empty");
        }

        const items : Record<string, StackUpdateProgress> = {};
        for (const name of names) {
            items[name] = { name,
                status: "pending" };
        }

        this.state = {
            running: true,
            endpoint,
            total: names.length,
            index: 0,
            current: "",
            items,
            startedAt: Date.now(),
            finishedAt: null,
        };

        this.broadcast({
            current: "",
            index: 0,
            total: names.length,
            status: "started",
        });

        // Fire and forget — processQueue swallows per-stack errors and always
        // resets state in its finally block.
        this.processQueue(names, endpoint).catch((e) => {
            log.error("update-manager", "Unexpected queue error: " + (e instanceof Error ? e.message : String(e)));
        });
    }

    private async processQueue(names : string[], endpoint : string) : Promise<void> {
        try {
            for (let i = 0; i < names.length; i++) {
                const stackName = names[i];
                this.state.current = stackName;
                this.state.items[stackName] = { name: stackName,
                    status: "updating" };
                this.broadcast({
                    current: stackName,
                    index: i,
                    total: this.state.total,
                    status: "updating",
                });

                try {
                    const stack = await Stack.getStack(this.server, stackName);
                    await stack.update(endpoint);
                    this.server.imageUpdates.delete(stackName);
                    this.state.items[stackName] = { name: stackName,
                        status: "done" };
                    this.broadcast({
                        current: stackName,
                        index: i,
                        total: this.state.total,
                        status: "done",
                    });
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    this.state.items[stackName] = { name: stackName,
                        status: "error",
                        error: msg };
                    this.broadcast({
                        current: stackName,
                        index: i,
                        total: this.state.total,
                        status: "error",
                        error: msg,
                    });
                    log.warn("update-manager", `Failed to update ${stackName}: ${msg}`);
                }

                this.state.index = i + 1;
                this.server.sendStackList();
            }
        } finally {
            this.state.running = false;
            this.state.current = "";
            this.state.finishedAt = Date.now();
            this.broadcast({
                current: "",
                index: this.state.total,
                total: this.state.total,
                status: "complete",
            });
        }
    }

    /**
     * Send a progress event to every authenticated socket so all open tabs
     * stay in sync, not just the one that started the queue.
     */
    private broadcast(payload : { current : string; index : number; total : number; status : string; error? : string }) {
        const event = {
            ...payload,
            endpoint: this.state.endpoint,
        };
        for (const socket of this.server.io.sockets.sockets.values()) {
            const dockgeSocket = socket as DockgeSocket;
            if (dockgeSocket.userID) {
                dockgeSocket.emit("updateStacksProgress", event);
            }
        }
    }
}
