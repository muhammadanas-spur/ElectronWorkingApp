const https = require('https');
const http = require('http');
const { URL } = require('url');

class WebhookService {
  constructor(config = {}) {
    this.webhookUrl = config.webhookUrl || process.env.WEBHOOK_URL;
    this.debug = config.debug || false;
  }

  log(message, data = null) {
    if (this.debug) {
      console.log(`[WebhookService] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
  }

  async sendTranscript(transcriptData) {
    if (!this.webhookUrl) {
      this.log('No webhook URL configured, skipping webhook send');
      return { success: false, error: 'No webhook URL configured' };
    }

    try {
      this.log('Sending transcript to webhook', {
        webhookUrl: this.webhookUrl,
        transcriptCount: transcriptData.transcripts?.length || 0
      });

      const payload = JSON.stringify(transcriptData);
      const url = new URL(this.webhookUrl);

      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      return new Promise((resolve, reject) => {
        const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            this.log('Webhook response received', {
              statusCode: res.statusCode,
              headers: res.headers,
              body: data
            });
            resolve({ success: true, statusCode: res.statusCode, response: data });
          });
        });

        req.on('error', (error) => {
          this.log('Webhook request failed', error);
          reject(error);
        });

        req.write(payload);
        req.end();
      });

    } catch (error) {
      this.log('Failed to send transcript to webhook', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = WebhookService;
