'use client';
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  const factor = Math.pow(10, dm);
  const truncated = Math.floor(val * factor) / factor;
  return `${truncated} ${sizes[i]}`;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const val = typeof payload[0].value === 'number' && payload[0].value > 1000 
      ? formatBytes(payload[0].value) 
      : `${payload[0].value} GB`;
    return (
      <div className="bg-neutral-800 border border-neutral-700 p-2 rounded-lg shadow-lg">
        <p className="text-sm font-medium text-neutral-200">{`${payload[0].name}: ${val}`}</p>
      </div>
    );
  }
  return null;
}

interface StorageChartProps {
  data: Array<{ name: string; value: number; color: string }>;
}

export function StorageChart({ data }: StorageChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          innerRadius={38}
          outerRadius={55}
          paddingAngle={2}
          dataKey="value"
          stroke="none"
          startAngle={90}
          endAngle={-270}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}
