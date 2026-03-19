"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const PORTS = [
    ["HTTP", 80], ["HTTPS", 443], ["FTP", 21], ["FTP Data", 20],
    ["SSH", 22], ["Telnet", 23], ["SMTP", 25], ["DNS", 53],
    ["DHCP Server", 67], ["DHCP Client", 68], ["TFTP", 69],
    ["POP3", 110], ["IMAP", 143], ["SNMP", 161], ["LDAP", 389],
    ["SMB", 445], ["SMTPS", 465], ["IMAPS", 993], ["POP3S", 995],
    ["MySQL", 3306], ["RDP", 3389], ["PostgreSQL", 5432],
    ["HTTP Alt", 8080], ["MongoDB", 27017], ["Redis", 6379],
    ["NTP", 123], ["Syslog", 514], ["MQTT", 1883],
];
function generateRounds(config, roundCount, timeLimitSec) {
    const direction = config.direction || "both";
    const rounds = [];
    const shuffled = [...PORTS].sort(() => Math.random() - 0.5);
    for (let i = 0; i < roundCount; i++) {
        const [service, port] = shuffled[i % shuffled.length];
        let type;
        if (direction === "service2port")
            type = "service2port";
        else if (direction === "port2service")
            type = "port2service";
        else
            type = Math.random() > 0.5 ? "service2port" : "port2service";
        rounds.push({
            type,
            prompt: type === "service2port" ? service : String(port),
            answer: type === "service2port" ? String(port) : service.toUpperCase(),
            timeLimitSec,
            meta: { service, port },
        });
    }
    return rounds;
}
function checkAnswer(submission, round) {
    if (round.type === "service2port") {
        return submission.trim() === round.answer;
    }
    // port2service: case-insensitive, allow common variations
    const sub = submission.trim().toUpperCase().replace(/\s+/g, " ");
    const ans = round.answer.toUpperCase();
    return sub === ans || sub === round.meta?.service?.toUpperCase();
}
const portBlitzModule = {
    generateRounds: generateRounds,
    checkAnswer,
    validateConfig(config) {
        const d = config.direction;
        if (d && d !== "service2port" && d !== "port2service" && d !== "both") {
            throw new Error("Direction must be service2port, port2service, or both");
        }
    },
};
exports.default = portBlitzModule;
//# sourceMappingURL=portBlitz.js.map