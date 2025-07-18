document.addEventListener('DOMContentLoaded', function() {
  // 定义目标页面的纯净哈希路径，不包含查询参数
  const TARGET_FULL_URL_HASH_PATH = "#/subpages/tuidanOrder/tuidanOrder";
  // 定义目标页面的完整URL，用于跳转时使用
  const TARGET_FULL_URL_FOR_CREATION = "https://h5.feedov.com/#/subpages/tuidanOrder/tuidanOrder";
  
  const toggleSwitch = document.getElementById('toggleSwitch');
  const statusText = document.getElementById('status');
  const offTargetArea = document.getElementById('off-target-area');
  const onTargetArea = document.getElementById('on-target-area');
  const targetLink = document.getElementById('targetLink'); // 获取超链接元素
  
  // 设置超链接点击事件，在新标签页打开
  if (targetLink) {
    targetLink.addEventListener('click', function(event) {
      event.preventDefault(); // 阻止默认跳转行为
      chrome.tabs.create({ url: TARGET_FULL_URL_FOR_CREATION }); // 在新标签页打开目标网址
      window.close(); // 关闭popup
    });
  }
  
  // 获取当前活动标签页的URL
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    const currentTabUrl = tabs[0].url;
    const urlObj = new URL(currentTabUrl);

    // 提取当前 URL 的哈希路径部分，忽略任何查询参数
    const currentHashPath = urlObj.hash.split('?')[0]; 

    // 判断是否是目标网址：只需比较纯净的哈希路径即可
    // 域名匹配已通过 content_scripts 的 matches 确保，这里主要检查哈希
    if (urlObj.origin + urlObj.pathname === new URL(TARGET_FULL_URL_FOR_CREATION).origin + new URL(TARGET_FULL_URL_FOR_CREATION).pathname && currentHashPath === TARGET_FULL_URL_HASH_PATH) {
      // 如果是目标网址，显示切换按钮区域
      onTargetArea.classList.remove('hidden');
      offTargetArea.classList.add('hidden');
      
      // 加载保存的开关状态（只有在目标网站才需要这些）
      chrome.storage.sync.get('isEnabled', function(data) {
        const isEnabled = data.isEnabled === undefined ? false : data.isEnabled; // 默认关闭
        toggleSwitch.checked = isEnabled;
        updateStatus(isEnabled);
      });
    
      // 监听开关状态变化
      toggleSwitch.addEventListener('change', function() {
        const isEnabled = this.checked;
        chrome.storage.sync.set({ 'isEnabled': isEnabled }, function() {
          updateStatus(isEnabled);
          
          // 通知 background.js 开关状态已改变
          chrome.runtime.sendMessage({ type: "toggleMonitoring", isEnabled: isEnabled });
        });
      });
    } else {
      // 如果不是目标网址，显示超链接区域
      offTargetArea.classList.remove('hidden');
      onTargetArea.classList.add('hidden');
    }
  });
  
  // 更新页面状态显示
  function updateStatus(isEnabled) {
    if (isEnabled) {
      statusText.textContent = "监测状态：已开启";
      statusText.style.color = "#28a745"; // 绿色
    } else {
      statusText.textContent = "监测状态：已关闭";
      statusText.style.color = "#dc3545"; // 红色
    }
  }
});