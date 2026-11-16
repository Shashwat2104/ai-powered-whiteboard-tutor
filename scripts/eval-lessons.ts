import fs from "node:fs/promises";
import path from "node:path";
import { generateLesson } from "../src/server/lesson/generate";
import { getEnv } from "../src/server/env";

interface LatencyRecord {
  topic: string;
  latencyMs: number;
  provider: string;
  model: string;
  attempts: number;
}

const DEFAULT_TOPICS = [
  "Binary Search algorithm",
  "How HTTP works",
  "Photosynthesis in plants",
  "Neural network basics",
  "Compound interest math",
  "How vaccines train immunity",
];

async function main() {
  const args = process.argv.slice(2);
  const latencyArgIdx = args.indexOf("--latency");
  const count = latencyArgIdx !== -1 && args[latencyArgIdx + 1] ? Number(args[latencyArgIdx + 1]) : 5;
  const onlyLatency = args.includes("--only-latency");

  console.log(`Starting lesson evaluation (count: ${count}, onlyLatency: ${onlyLatency})...`);

  const records: LatencyRecord[] = [];
  const topics = DEFAULT_TOPICS.slice(0, count);
  const env = getEnv();

  for (const topic of topics) {
    const start = performance.now();
    try {
      const lesson = await generateLesson({ topic, difficulty: "beginner" }, env);
      const duration = performance.now() - start;
      records.push({
        topic,
        latencyMs: Math.round(duration),
        provider: lesson.generatedBy.provider,
        model: lesson.generatedBy.model,
        attempts: lesson.generatedBy.attempts,
      });
      console.log(`✓ ${topic}: ${Math.round(duration)}ms (${lesson.generatedBy.provider})`);
    } catch (err) {
      console.error(`✗ ${topic} failed:`, err);
    }
  }

  if (records.length > 0) {
    const latencies = records.map((r) => r.latencyMs).sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
    const p90 = latencies[Math.floor(latencies.length * 0.9)] ?? 0;

    const summary = {
      timestamp: new Date().toISOString(),
      sampleCount: records.length,
      p50Ms: p50,
      p90Ms: p90,
      records,
    };

    const outDir = path.resolve(__dirname, "../docs/evidence");
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, "latency.json"), JSON.stringify(summary, null, 2), "utf-8");
    console.log(`Saved latency report to docs/evidence/latency.json (p50: ${p50}ms, p90: ${p90}ms)`);
  }
}

void main();
