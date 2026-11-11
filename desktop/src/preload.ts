import { contextBridge, ipcRenderer } from "electron";

const isDefaultApp = (process as NodeJS.Process & { defaultApp?: boolean }).defaultApp === true;
const defaultApiUrl = isDefaultApp
  ? "http://127.0.0.1:5080/api/v1"
  : "https://lucky-crane-4648.a.tuna.free/api/v1";

contextBridge.exposeInMainWorld("desktop", {
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  version: () => ipcRenderer.invoke("app:version") as Promise<string>,
  platform: process.platform,
  apiUrl: process.env.FF_API_URL ?? defaultApiUrl,
});
