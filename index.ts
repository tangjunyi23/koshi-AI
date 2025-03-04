import { Context, Session } from 'koishi';
import axios from 'axios';
import OpenAI from 'openai';

export const name = 'deepseek-ai';

const API_KEY = 'your api key';
const MEMORY_LENGTH = 10;
const RESPONSE_PROBABILITY = 0.1;
const COOLDOWN_TIME = 30000;
let lastResponseTime = 0;

const defaultSettings = {
  name: "ano",
  personality: "成绩优秀，精力充沛，品学兼优的优等生...",
  style: "俏皮可爱，说话字数不要太多",
  background: "月之森女子学园高中一年级生，丰川祥子的青梅竹马..."
};

const globalMemory: Record<string, { role: string; content: string }[]> = {};
const groupSettings: Record<string, typeof defaultSettings> = {};
const processedMessages: Set<string> = new Set(); // 记录已处理消息
let lastReply = "";

async function getAIResponse(groupId: string): Promise<string> {
  try {
    if (!globalMemory[groupId]) globalMemory[groupId] = [];
    if (!groupSettings[groupId]) groupSettings[groupId] = { ...defaultSettings };
    
    const { name, personality, style, background } = groupSettings[groupId];
    const recentMessages = globalMemory[groupId].slice(-MEMORY_LENGTH);
    const conversationContext = recentMessages.map(msg => msg.content).join(' ');

    const systemMessage = {
      role: "system",
      content: `你是${name}，你的性格是${personality}，你的说话风格是${style}，你的背景经历是${background}。
      你需要基于群聊的历史聊天内容进行自然，连贯的总结性回复，要混入群聊之中，不要让大家发现你是AI。避免重复相同内容，尽量使用不同的表达方式。`
    };

    const openai = new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: API_KEY });
    let response;
    let reply;
    let attempts = 3;
    
    do {
      response = await openai.chat.completions.create({
        messages: [systemMessage, { role: "user", content: conversationContext }],
        model: "deepseek-chat"
      });

      if (!response || !response.choices || response.choices.length === 0) return "...";
      reply = response.choices[0]?.message?.content.trim() || "...";
      attempts--;
    } while (attempts > 0 && (globalMemory[groupId].some(msg => msg.content === reply) || reply === lastReply));

    lastReply = reply;
    globalMemory[groupId].push({ role: "assistant", content: reply });
    return reply;
  } catch (error) {
    return "...";
  }
}

export function apply(ctx: Context) {
  ctx.middleware(async (session: Session, next) => {
    const message = session.content.trim();
    const groupId = session.guildId || session.userId || 'private';

    if (processedMessages.has(message)) {
      return next(); // 如果消息已处理，则直接跳过
    }
    
    processedMessages.add(message); // 标记消息已处理

    if (!globalMemory[groupId]) globalMemory[groupId] = [];
    globalMemory[groupId].push({ role: "user", content: message });
    while (globalMemory[groupId].length > MEMORY_LENGTH) {
      globalMemory[groupId].shift();
    }

    if (message.startsWith("#设置")) {
      const [_, key, ...valueParts] = message.split(" ");
      const value = valueParts.join(" ");
      if (Object.keys(defaultSettings).includes(key)) {
        if (!groupSettings[groupId]) groupSettings[groupId] = { ...defaultSettings };
        groupSettings[groupId][key as keyof typeof defaultSettings] = value;
        return `✅ 已更新 AI 的 ${key} 设置为: ${value}`;
      }
      return "❌ 无效的设置项，可调整项包括 name, personality, style, background。";
    }

    if (message === "#查询设置") {
      const settings = groupSettings[groupId] || defaultSettings;
      return `📌 当前 AI 设置：\n名称: ${settings.name}\n性格: ${settings.personality}\n风格: ${settings.style}\n背景: ${settings.background}`;
    }

    if (message === "cr 清空记忆") { 
      delete globalMemory[groupId]; 
      return "✅ 当前群聊的 AI 对话上下文已清空。"; 
    }
    
    if (message.startsWith("ai ")) return await getAIResponse(groupId);

    if (message.startsWith("#反馈")) {
      return "📩 反馈请联系 QQ：2252291884\n";
    }

    if (Math.random() < RESPONSE_PROBABILITY) {
      const now = Date.now();
      if (now - lastResponseTime > COOLDOWN_TIME) {
        lastResponseTime = now;
        return await getAIResponse(groupId);
      }
    }
    return next();
  });
}









