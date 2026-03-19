import { GameModuleServer, GameRound } from "./types";

interface OsiItem {
  name: string;
  layer: number;
  layerName: string;
}

const OSI_ITEMS: OsiItem[] = [
  // Layer 7 - Application
  { name: "HTTP", layer: 7, layerName: "Application" },
  { name: "HTTPS", layer: 7, layerName: "Application" },
  { name: "FTP", layer: 7, layerName: "Application" },
  { name: "SMTP", layer: 7, layerName: "Application" },
  { name: "DNS", layer: 7, layerName: "Application" },
  { name: "SNMP", layer: 7, layerName: "Application" },
  { name: "DHCP", layer: 7, layerName: "Application" },
  { name: "SSH", layer: 7, layerName: "Application" },
  { name: "Telnet", layer: 7, layerName: "Application" },
  { name: "POP3", layer: 7, layerName: "Application" },
  { name: "IMAP", layer: 7, layerName: "Application" },
  // Layer 6 - Presentation
  { name: "SSL/TLS encryption", layer: 6, layerName: "Presentation" },
  { name: "JPEG compression", layer: 6, layerName: "Presentation" },
  { name: "ASCII encoding", layer: 6, layerName: "Presentation" },
  { name: "Data encryption", layer: 6, layerName: "Presentation" },
  { name: "MIME types", layer: 6, layerName: "Presentation" },
  // Layer 5 - Session
  { name: "NetBIOS", layer: 5, layerName: "Session" },
  { name: "RPC", layer: 5, layerName: "Session" },
  { name: "Session establishment", layer: 5, layerName: "Session" },
  { name: "Authentication dialog", layer: 5, layerName: "Session" },
  // Layer 4 - Transport
  { name: "TCP", layer: 4, layerName: "Transport" },
  { name: "UDP", layer: 4, layerName: "Transport" },
  { name: "Port numbers", layer: 4, layerName: "Transport" },
  { name: "Segmentation", layer: 4, layerName: "Transport" },
  { name: "Flow control", layer: 4, layerName: "Transport" },
  { name: "Three-way handshake", layer: 4, layerName: "Transport" },
  // Layer 3 - Network
  { name: "IP addressing", layer: 3, layerName: "Network" },
  { name: "Router", layer: 3, layerName: "Network" },
  { name: "ICMP (ping)", layer: 3, layerName: "Network" },
  { name: "IPv4 / IPv6", layer: 3, layerName: "Network" },
  { name: "Subnet mask", layer: 3, layerName: "Network" },
  { name: "OSPF routing", layer: 3, layerName: "Network" },
  { name: "Packet", layer: 3, layerName: "Network" },
  // Layer 2 - Data Link
  { name: "MAC address", layer: 2, layerName: "Data Link" },
  { name: "Switch", layer: 2, layerName: "Data Link" },
  { name: "Ethernet frame", layer: 2, layerName: "Data Link" },
  { name: "ARP", layer: 2, layerName: "Data Link" },
  { name: "VLAN", layer: 2, layerName: "Data Link" },
  { name: "PPP", layer: 2, layerName: "Data Link" },
  // Layer 1 - Physical
  { name: "Hub", layer: 1, layerName: "Physical" },
  { name: "Cable / Fiber optic", layer: 1, layerName: "Physical" },
  { name: "Bit transmission", layer: 1, layerName: "Physical" },
  { name: "Wi-Fi signals", layer: 1, layerName: "Physical" },
  { name: "Repeater", layer: 1, layerName: "Physical" },
  { name: "Voltage levels", layer: 1, layerName: "Physical" },
];

const LAYER_NAMES = ["", "Physical", "Data Link", "Network", "Transport", "Session", "Presentation", "Application"];

function generateRounds(config: Record<string, unknown>, roundCount: number, timeLimitSec: number): GameRound[] {
  const mode = (config.mode as string) || "number"; // "number" or "name"
  const shuffled = [...OSI_ITEMS].sort(() => Math.random() - 0.5);
  const rounds: GameRound[] = [];

  for (let i = 0; i < roundCount; i++) {
    const item = shuffled[i % shuffled.length];
    const options = mode === "name"
      ? LAYER_NAMES.slice(1).map((name, idx) => ({ value: name, label: `L${idx + 1}: ${name}` }))
      : Array.from({ length: 7 }, (_, j) => ({ value: String(j + 1), label: `Layer ${j + 1}` }));

    rounds.push({
      type: "identify_layer",
      prompt: item.name,
      answer: mode === "name" ? item.layerName : String(item.layer),
      timeLimitSec,
      meta: {
        layer: item.layer,
        layerName: item.layerName,
        options,
        inputType: "mcq",
      },
    });
  }
  return rounds;
}

function checkAnswer(submission: string, round: GameRound): boolean {
  return submission.trim().toUpperCase() === round.answer.toUpperCase();
}

const osiLayerModule: GameModuleServer = {
  generateRounds: generateRounds,
  checkAnswer,
};

export default osiLayerModule;
