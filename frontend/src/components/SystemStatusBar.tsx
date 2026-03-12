import { useConnection } from "../contexts/ConnectionContext";

export default function SystemStatusBar() {
    const { systemOnline, systemLive, currentTime } = useConnection();

    return (
        <div className="w-full bg-slate-50 border-b border-slate-200 px-6 py-1.5 flex justify-between items-center backdrop-blur-md z-50">
            <div className="flex gap-10 items-center">

                {/* Status Indicators */}
                <div className="flex gap-6 items-center border-r border-slate-200 pr-10">

                    <StatusIndicator
                        label="Backend"
                        status={systemOnline}
                    />

                    <StatusIndicator
                        label="Sensors"
                        status={systemLive}
                    />

                </div>

                {/* Status Legend */}
                <div className="flex gap-4 items-center">
                    <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-tighter">
                            Live
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-tighter">
                            Offline
                        </span>
                    </div>
                </div>

            </div>

            <div className="text-slate-500 font-mono text-[11px] tabular-nums tracking-normal flex items-center gap-2">
                <span className="text-slate-300">|</span>
                {currentTime}
            </div>
        </div>
    );
}

function StatusIndicator({
    label,
    status,
}: {
    label: string;
    status: boolean;
}) {
    return (
        <div className="flex items-center gap-2.5">
            <div
                className={`w-2 h-2 rounded-full transition-all duration-700 ease-in-out ${status
                        ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                        : "bg-rose-500 animate-pulse shadow-[0_0_10px_rgba(244,63,94,0.5)]"
                    }`}
            />
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-600">
                {label}
            </span>
        </div>
    );
}