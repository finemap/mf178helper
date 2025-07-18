// background.js - 插件后台服务工作线程脚本
// 负责管理插件的全局状态、图标显示逻辑以及与内容脚本的消息通信。

const ACTIVE_ICONS = {
    "16": "icons/icon16_active.png",
    "48": "icons/icon48_active.png",
    "128": "icons/icon128_active.png"
};

const INACTIVE_ICONS = {
    "16": "icons/icon16_inactive.png",
    "48": "icons/icon48_inactive.png",
    "128": "icons/icon128_inactive.png"
};

// 目标网址前缀 (用于判断是否是我们的目标网站)
const TARGET_URL_PREFIX = "https://h5.feedov.com/";
// 完整的目标哈希路由，用于精确判断，这里定义为纯净的哈希路径，不含查询参数
const TARGET_FULL_URL_HASH_PATH = "#/subpages/tuidanOrder/tuidanOrder"; 
// 提取出目标 URL 的“基础部分”和“哈希路由部分”
const TARGET_BASE_URL = "https://h5.feedov.com/";
const TARGET_HASH_ROUTE = "#/subpages/tuidanOrder/tuidanOrder"; // 这个也应该是纯净的哈希路径

// 用于跟踪当前的电源请求类型，避免重复请求或释放
let powerRequestType = null;

/**
 * 请求操作系统保持唤醒状态。
 * 'display': 防止系统和显示器进入睡眠。
 * 'system': 仅防止系统进入睡眠（显示器可能仍然关闭）。
 */
function requestPowerKeepAlive() {
    if (powerRequestType !== 'display') { // 避免重复请求相同的类型
        chrome.power.requestKeepAwake('display');
        powerRequestType = 'display';
        console.log("[Background Service Worker] 已请求操作系统保持显示器唤醒。");
    }
}

/**
 * 释放操作系统保持唤醒的状态。
 * 如果之前有请求，则释放。
 */
function releasePowerKeepAlive() {
    if (powerRequestType !== null) { // 只有在有请求时才释放
        chrome.power.releaseKeepAwake();
        powerRequestType = null;
        console.log("[Background Service Worker] 已释放操作系统保持唤醒状态。");
    }
}

/**
 * 根据当前活动标签页的URL和插件的总开关状态来设置浏览器工具栏图标，
 * 并同步控制操作系统电源管理。
 */
async function updateIconBasedOnTabAndState() {
    // 1. 获取插件的总开关状态
    const data = await chrome.storage.sync.get('isEnabled');
    const isPluginEnabled = data.isEnabled === undefined ? false : data.isEnabled; // 默认关闭

    // 2. 获取当前活动标签页的 URL
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    let isTargetPage = false; // 默认不在目标页面

    if (tab && tab.url) {
        // 如果插件总开关关闭，图标显示为非活跃，并释放电源锁
        if (!isPluginEnabled) {
            setPluginIcon(false);
            releasePowerKeepAlive();
            return;
        }

        // 优化匹配逻辑：
        // 1. 检查 URL 是否以 TARGET_BASE_URL 开头 (域名匹配)
        // 2. 检查 URL 的哈希部分是否以 TARGET_HASH_ROUTE 开头 (SPA路由匹配)
        const url = new URL(tab.url);
        const isTargetDomain = url.origin === new URL(TARGET_BASE_URL).origin;
        
        // 从 URL.hash 中提取哈希路径部分，忽略任何查询参数
        const hashPath = url.hash.split('?')[0]; 
        const isTargetHashPath = hashPath === TARGET_HASH_ROUTE; // 精确匹配哈希路由

        isTargetPage = isTargetDomain && isTargetHashPath;

        setPluginIcon(isTargetPage); // 设置图标

        // 根据是否在目标页面且插件启用，来决定是否保持唤醒
        if (isTargetPage) {
            requestPowerKeepAlive(); // 在目标页面时请求保持唤醒
        } else {
            releasePowerKeepAlive(); // 不在目标页面时释放电源锁
        }
    } else {
        // 如果没有有效的活动标签页URL (例如在特殊页面)，显示非活跃图标并释放电源锁
        setPluginIcon(false);
        releasePowerKeepAlive();
    }
}

/**
 * 根据状态设置插件图标。
 * @param {boolean} isActive - 是否显示活跃图标。
 */
function setPluginIcon(isActive) {
    const path = isActive ? ACTIVE_ICONS : INACTIVE_ICONS;
    chrome.action.setIcon({ path: path });
}


// ======================== 事件监听器 ========================

// 首次安装或浏览器启动时，设置初始图标并确保电源状态正确
chrome.runtime.onInstalled.addListener(updateIconBasedOnTabAndState);

chrome.runtime.onStartup.addListener(async () => {
    // 浏览器启动时，强制将插件状态重置为“关闭”
    await chrome.storage.sync.set({ 'isEnabled': false });
    // 然后根据重置后的状态更新图标和电源管理
    updateIconBasedOnTabAndState();
    console.log("[Background Service Worker] 浏览器启动，插件状态已重置为关闭，等待用户手动激活。");
});

// 监听来自 popup.js 的消息 (开关状态改变)
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.type === "toggleMonitoring") {
        console.log(`[Background Service Worker] 监测功能被设置为: ${request.isEnabled ? '开启' : '关闭'}`);

        // 状态改变后，重新评估图标状态和电源管理
        await updateIconBasedOnTabAndState();

        // 当开关状态改变时，通知所有当前活跃的 content script
        chrome.tabs.query({url: `${TARGET_URL_PREFIX}*`}, function(tabs) {
            tabs.forEach(tab => {
                if (tab.id) {
                    chrome.tabs.sendMessage(tab.id, { type: "updateMonitoringStatus", isEnabled: request.isEnabled })
                        .catch(error => {
                            // 忽略 'Could not establish connection' 错误，这通常是由于 content script 尚未注入或页面已关闭
                            if (!error.message.includes("Could not establish connection. Receiving end does not exist.")) {
                                console.error(`[Background Service Worker] 向 Tab ID ${tab.id} 发送消息时出错:`, error);
                            }
                        });
                }
            });
        });
    }
});

// 监听标签页更新事件 (页面加载或URL变化)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // 仅在页面加载完成后检查图标状态和发送消息，以确保 DOM 已准备好
    if (changeInfo.status === 'complete') {
        // 更新图标状态和电源管理
        await updateIconBasedOnTabAndState();

        // 如果更新的标签页是目标域名，才发送消息给 content.js
        if (tab.url && tab.url.startsWith(TARGET_URL_PREFIX)) {
            const data = await chrome.storage.sync.get('isEnabled');
            const isEnabled = data.isEnabled === undefined ? false : data.isEnabled; // 确保发送正确的默认状态
            chrome.tabs.sendMessage(tabId, { type: "updateMonitoringStatus", isEnabled: isEnabled })
                .catch(error => {
                    if (!error.message.includes("Could not establish connection. Receiving end does not exist.")) {
                        console.error(`[Background Service Worker] 向新加载的 Tab ID ${tabId} 发送消息时出错:`, error);
                    }
                });
        }
    }
});

// 监听标签页激活事件 (用户切换标签页时)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    // 当用户切换标签页时，更新图标状态和电源管理
    await updateIconBasedOnTabAndState();

    // 重新获取当前活动标签页，以确保获取到最新的URL，并向其发送状态
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id && tab.url && tab.url.startsWith(TARGET_URL_PREFIX)) {
        const data = await chrome.storage.sync.get('isEnabled');
        const isEnabled = data.isEnabled === undefined ? false : data.isEnabled; // 确保发送正确的默认状态
        chrome.tabs.sendMessage(tab.id, { type: "updateMonitoringStatus", isEnabled: isEnabled })
            .catch(error => {
                if (!error.message.includes("Could not establish connection. Receiving end does not exist.")) {
                    console.error(`[Background Service Worker] 向激活的 Tab ID ${tab.id} 发送消息时出错:`, error);
                }
            });
    }
});

// 监听标签页移除事件 (标签页被关闭时)
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    // 当标签页被关闭时，当前活动标签页可能发生变化，更新图标和电源管理
    // 使用 setTimeout 稍作延迟，因为 onRemoved 触发时，新的活动标签页可能尚未完全确定
    setTimeout(updateIconBasedOnTabAndState, 50);
});

// 初始调用：确保插件 Service Worker 启动时，图标和电源管理处于正确状态
updateIconBasedOnTabAndState();