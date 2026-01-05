# Self-Signed SSL Certificates Guide

This guide explains how to use Aviant with Frigate servers that have self-signed SSL certificates.

## Why This Matters

If your Frigate server uses HTTPS with a self-signed certificate (not from a trusted Certificate Authority), Android will reject the connection by default for security reasons. This is common for:

- Local Frigate installations without a reverse proxy
- Servers accessed via Tailscale
- Development/testing environments
- Home networks without proper SSL setup

## Solutions (Easiest to Best)

### Option 1: Install Certificate on Android Device (Quick Fix)

**Step 1: Export Certificate from Server**

On your computer, run:
```bash
# Get certificate from your Frigate server
echo | openssl s_client -connect YOUR-FRIGATE-IP:8971 -showcerts 2>/dev/null | \
  openssl x509 -outform PEM > frigate.crt
```

Replace `YOUR-FRIGATE-IP:8971` with your Frigate server address (e.g., `192.168.1.100:8971`).

**Step 2: Transfer to Android**
- Email the `frigate.crt` file to yourself, OR
- Use ADB: `adb push frigate.crt /sdcard/Download/`, OR
- Use a file sharing app

**Step 3: Install on Android**
1. Open **Settings** → **Security** → **Encryption & credentials**
2. Tap **Install a certificate** → **CA certificate**
3. Tap **Install Anyway** (if warned)
4. Browse and select `frigate.crt`
5. Name it "Frigate Server" or similar
6. Done! Return to Aviant and try connecting

### Option 2: Use Tailscale with MagicDNS (Recommended for Remote Access)

[Tailscale](https://tailscale.com) provides secure remote access with automatic HTTPS:

1. Install Tailscale on your Frigate server and Android device
2. Enable MagicDNS in Tailscale admin console
3. Enable HTTPS in Tailscale admin console
4. Access Frigate via: `https://your-frigate-machine.tail-scale.ts.net:8971`
5. Certificate is automatically trusted!

### Option 3: Reverse Proxy with Let's Encrypt (Best for Production)

Set up a reverse proxy with free SSL certificates:

#### Using Caddy (Easiest)
```caddy
frigate.yourdomain.com {
    reverse_proxy localhost:8971
}
```

#### Using Nginx with Certbot
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d frigate.yourdomain.com
```

#### Using Traefik
Add to your `docker-compose.yml`:
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.frigate.rule=Host(`frigate.yourdomain.com`)"
  - "traefik.http.routers.frigate.tls.certresolver=letsencrypt"
```

### Option 4: Cloudflare Tunnel (No Port Forwarding Needed)

1. Set up [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
2. Point it to your Frigate instance: `localhost:8971`
3. Access via: `https://frigate.yourdomain.com`
4. Free SSL certificate from Cloudflare!

## Verifying Certificate Installation

After installing a certificate, verify it works:

1. Open Chrome on your Android device
2. Navigate to `https://YOUR-FRIGATE-IP:8971` (your Frigate URL)
3. If no certificate warning appears → Success!
4. If you still see a warning → Certificate not installed correctly

## Troubleshooting

**"Certificate not trusted" error persists**
- Make sure you installed the certificate as a **CA certificate** (not VPN/App certificate)
- Verify the certificate matches your server (check Common Name)
- Try restarting your Android device after installation

**Can't find certificate installation option**
- Some Android versions hide this under **Advanced** settings
- On Samsung devices: Settings → Biometrics and security → Other security settings → Install from device storage

**Getting "Network Error" instead of certificate error**
- Check if Frigate is actually using HTTPS on port 8971
- Verify you can access Frigate from your Android device's browser
- Make sure both devices are on the same network (for local access)

**Works in browser but not in Aviant**
- The app uses the system certificate store, same as Chrome
- If Chrome works, Aviant should too
- Try force-closing and reopening Aviant
- Clear app data if issue persists

## For Frigate Developers

If you're setting up Frigate for the first time, we **strongly recommend**:

1. **For local-only access**: Use Tailscale (easiest, most secure)
2. **For public access**: Use Caddy or Nginx with Let's Encrypt (free, automated)
3. **Avoid**: Self-signed certificates if possible (harder to manage across devices)

## Security Note

Installing a certificate means you're explicitly trusting it. Only install certificates from servers you control and trust. Never install certificates from unknown sources.

## Need Help?

- Check Frigate documentation: https://docs.frigate.video/
- Tailscale setup guide: https://tailscale.com/kb/
- Let's Encrypt guide: https://letsencrypt.org/getting-started/
