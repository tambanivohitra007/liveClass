import { GameModuleServer, GameRound } from "./types";

function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

function cidrToMask(cidr: number): number {
  return cidr === 0 ? 0 : (~0 << (32 - cidr)) >>> 0;
}

function generateRounds(config: Record<string, unknown>, roundCount: number, timeLimitSec: number): GameRound[] {
  const questionTypes = (config.questionTypes as string[]) || ["subnet_mask", "network_addr", "broadcast_addr", "host_count"];
  const rounds: GameRound[] = [];

  for (let i = 0; i < roundCount; i++) {
    const type = questionTypes[i % questionTypes.length];
    // Random CIDR between /8 and /30
    const cidr = 8 + Math.floor(Math.random() * 23);
    const mask = cidrToMask(cidr);
    // Random IP
    const octet1 = [10, 172, 192][Math.floor(Math.random() * 3)];
    const octet2 = octet1 === 172 ? 16 + Math.floor(Math.random() * 16) : octet1 === 192 ? 168 : Math.floor(Math.random() * 256);
    const octet3 = Math.floor(Math.random() * 256);
    const octet4 = 1 + Math.floor(Math.random() * 254);
    const ipInt = ((octet1 << 24) | (octet2 << 16) | (octet3 << 8) | octet4) >>> 0;
    const networkInt = (ipInt & mask) >>> 0;
    const broadcastInt = (networkInt | (~mask >>> 0)) >>> 0;
    const hostCount = Math.pow(2, 32 - cidr) - 2;

    const ip = intToIp(ipInt);
    let prompt: string;
    let answer: string;
    let question: string;

    switch (type) {
      case "subnet_mask":
        prompt = `${ip}/${cidr}`;
        answer = intToIp(mask);
        question = "What is the subnet mask?";
        break;
      case "network_addr":
        prompt = `${ip}/${cidr}`;
        answer = intToIp(networkInt);
        question = "What is the network address?";
        break;
      case "broadcast_addr":
        prompt = `${ip}/${cidr}`;
        answer = intToIp(broadcastInt);
        question = "What is the broadcast address?";
        break;
      case "host_count":
        prompt = `/${cidr}`;
        answer = String(Math.max(0, hostCount));
        question = "How many usable hosts?";
        break;
      default:
        prompt = `${ip}/${cidr}`;
        answer = intToIp(mask);
        question = "What is the subnet mask?";
    }

    rounds.push({
      type,
      prompt,
      answer,
      timeLimitSec,
      meta: { question, ip, cidr, mask: intToIp(mask), network: intToIp(networkInt), broadcast: intToIp(broadcastInt), hostCount: Math.max(0, hostCount) },
    });
  }
  return rounds;
}

function checkAnswer(submission: string, round: GameRound): boolean {
  const sub = submission.trim();
  const ans = round.answer;
  if (round.type === "host_count") {
    return sub === ans || parseInt(sub) === parseInt(ans);
  }
  // IP address comparison: normalize
  return sub === ans;
}

const subnetModule: GameModuleServer = {
  generateRounds: generateRounds,
  checkAnswer,
  validateConfig(config) {
    const types = config.questionTypes as string[] | undefined;
    if (types && types.length === 0) throw new Error("Select at least one question type");
  },
};

export default subnetModule;
