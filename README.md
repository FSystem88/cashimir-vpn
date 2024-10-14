<h1>VPN for Chrome</h1>

<p>This Chrome extension allows you to easily connect and disconnect from a SOCKS5 proxy server hosted on your own server. With a simple click, you can switch between your regular internet connection and the secure connection provided by the VPN.</p>

<h2>Features</h2>
<ul>
    <li>Toggle VPN connection on and off with buttons</li>
    <li>Real-time IP address display</li>
    <li>Notification of successful connection to the VPN</li>
    <li>Automatic disconnection on failed VPN connection</li>
</ul>

<h2>Installation</h2>
<ol>
    <li>Download the extension files by clicking the link below:</li>
    <li><a href="https://github.com/FSystem88/vpn-for-chrome/archive/refs/heads/main.zip">Download VPN for Chrome</a></li>
    <li>Extract the downloaded ZIP file to a directory on your computer.</li>
    <li>Open Chrome and navigate to <strong>chrome://extensions/</strong>.</li>
    <li>Enable "Developer mode" by toggling the switch in the top right corner.</li>
    <li>Click on "Load unpacked" and select the directory where you extracted the extension files.</li>
    <li>The VPN for Chrome extension should now be installed and ready to use!</li>
</ol>

<h2>Configuration</h2>
<p>Before using the extension, make sure to configure the following parameters in the <code>background.js</code> file:</p>
<ul>
    <li><strong>Line 6:</strong> Update <code>host = 'YOUR_SERVER_IP';</code> with your server's IP address.</li>
    <li><strong>Line 7:</strong> Update <code>port = YOUR_SERVER_PORT;</code> with the port number of your SOCKS5 proxy (default is usually 1080).</li>
    <li><strong>Line 29:</strong> Update <code>username = 'YOUR_USERNAME';</code> with your SOCKS5 proxy username.</li>
    <li><strong>Line 30:</strong> Update <code>password = 'YOUR_PASSWORD';</code> with your SOCKS5 proxy password.</li>
</ul>

<p>And for <code>popup.js</code> file:</p>
<ul>
    <li><strong>Line 5:</strong> Update <code>vpnIP = 'YOUR_SERVER_IP';</code> with your server's IP address.</li>
</ul>

<h2>Usage</h2>
<p>Once the extension is installed and configured, you can easily connect to your SOCKS5 proxy by clicking the "Connect" button. The IP address displayed below will update in real-time, notifying you of the current connection status. If the connection fails, the extension will automatically disconnect.</p>

<h2>License</h2>
<p>This project is licensed under the MIT License - see the <a href="LICENSE">LICENSE</a> file for details.</p>

<h2>Contact</h2>
<p>If you have any questions or issues, feel free to open an issue in the GitHub repository.</p>
