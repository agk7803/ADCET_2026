import { useConnection } from "../contexts/ConnectionContext";

export function useBackendHealth() {
    const { backendConnected, sensorsRunning, currentTime } = useConnection();
    return { connected: backendConnected, sensorsRunning, currentTime };
}