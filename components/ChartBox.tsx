"use client";
import { Chart, registerables, type ChartConfiguration } from "chart.js";
import { useEffect, useRef } from "react";

Chart.register(...registerables);
Chart.defaults.font.family = "'Pretendard Variable', Pretendard, sans-serif";
Chart.defaults.color = "#5a6b85";

export default function ChartBox({ config, height = 240 }: { config: ChartConfiguration; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = new Chart(ref.current!, { ...config, options: { maintainAspectRatio: false, responsive: true, ...config.options } });
    return () => c.destroy();
  }, [config]);
  return <div style={{ height, position: "relative" }}><canvas ref={ref} /></div>;
}
