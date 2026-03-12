import { useConnection } from "../contexts/ConnectionContext";

export default function OfflineBanner() {
    const { connected } = useConnection();

    if (connected) return null;

    return (
        <div className="w-full bg-red-100 border-b border-red-300 text-red-700 text-sm px-6 py-2 flex justify-center">
            <span className="font-semibold">
                ⚠ SYSTEM OFFLINE – Attempting Reconnection...
            </span>
        </div>
    );
}