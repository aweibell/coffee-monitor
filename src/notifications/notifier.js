const nodemailer = require('nodemailer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class Notifier {
    constructor(config) {
        this.config = config;
        this.emailTransporter = null;
        this.initializeEmail();
    }

    async initializeEmail() {
        if (this.config.email?.enabled && this.config.email.smtp) {
            try {
                this.emailTransporter = nodemailer.createTransport(this.config.email.smtp);
                // Test the connection
                await this.emailTransporter.verify();
                console.log('Email transporter initialized successfully');
            } catch (error) {
                console.warn('Email transporter initialization failed:', error.message);
                this.emailTransporter = null;
            }
        }
    }

    async notify(type, data) {
        const notifications = [];

        switch (type) {
            case 'favorite_available':
                notifications.push(...await this.notifyFavoriteAvailable(data));
                break;
            case 'new_products':
                notifications.push(...await this.notifyNewProducts(data));
                break;
            case 'error':
                notifications.push(...await this.notifyError(data));
                break;
            default:
                console.warn(`Unknown notification type: ${type}`);
        }

        return notifications;
    }

    async notifyFavoriteAvailable(data) {
        const { product, favoritePattern } = data;
        const notifications = [];

        const message = {
            title: `☕ Favorittkaffi tilgjengeleg!`,
            body: `${product.name} (${product.current_price} kr) er no tilgjengeleg hjå ${this.config.roastery?.name || 'eit kaffibrenneri'}!`,
            product: product,
            favoriteName: data.favoriteName,
            matchedTerms: data.matchedTerms
        };

        // Email notification
        if (this.config.email?.enabled) {
            try {
                const emailSent = await this.sendEmailNotification(message, 'favorite');
                if (emailSent) {
                    notifications.push({ type: 'email', success: true, message: 'Email sent' });
                }
            } catch (error) {
                notifications.push({ type: 'email', success: false, error: error.message });
            }
        }

        // Desktop notification
        if (this.config.desktop?.enabled) {
            try {
                const desktopSent = await this.sendDesktopNotification(message);
                if (desktopSent) {
                    notifications.push({ type: 'desktop', success: true, message: 'Desktop notification sent' });
                }
            } catch (error) {
                notifications.push({ type: 'desktop', success: false, error: error.message });
            }
        }

        return notifications;
    }

    async notifyNewProducts(data) {
        const { products } = data;
        const notifications = [];

        if (products.length === 0) return notifications;

        const message = {
            title: `☕ Nye produkt tilgjengelege!`,
            body: `${products.length} nye kaffiprodukt er tilgjengelege hjå ${this.config.roastery?.name || 'eit kaffibrenneri'}`,
            products: products
        };

        if (this.config.email?.enabled) {
            try {
                const emailSent = await this.sendEmailNotification(message, 'new_products');
                if (emailSent) {
                    notifications.push({ type: 'email', success: true, message: 'Email sent' });
                }
            } catch (error) {
                notifications.push({ type: 'email', success: false, error: error.message });
            }
        }

        return notifications;
    }

    async notifyError(data) {
        const { error, context } = data;
        const notifications = [];

        const message = {
            title: `⚠️ Coffee Monitor Error`,
            body: `Feil i coffee monitor: ${error.message}`,
            error: error,
            context: context
        };

        // Only send error notifications via email to avoid spam
        if (this.config.email?.enabled) {
            try {
                const emailSent = await this.sendEmailNotification(message, 'error');
                if (emailSent) {
                    notifications.push({ type: 'email', success: true, message: 'Error email sent' });
                }
            } catch (error) {
                notifications.push({ type: 'email', success: false, error: error.message });
            }
        }

        return notifications;
    }

    async sendEmailNotification(message, templateType) {
        if (!this.emailTransporter) {
            console.warn('Email transporter not available');
            return false;
        }

        try {
            const emailContent = this.generateEmailContent(message, templateType);
            
            const mailOptions = {
                from: this.config.email.from,
                to: this.config.email.to,
                subject: message.title,
                html: emailContent.html,
                text: emailContent.text
            };

            const result = await this.emailTransporter.sendMail(mailOptions);
            console.log('Email sent successfully:', result.messageId);
            return true;
        } catch (error) {
            console.error('Failed to send email:', error);
            return false;
        }
    }

    generateEmailContent(message, templateType) {
        let html = `
        <div style=\"font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;\">
            <h2 style=\"color: #8B4513;\">${message.title}</h2>
        `;

        let text = `${message.title}\n\n`;

        switch (templateType) {
            case 'favorite':
                const product = message.product;
                html += `
                    <p>Hei!</p>
                    <p>Ein av dine favorittkaffiar er no tilgjengeleg:</p>
                    <div style=\"background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;\">
                        <h3 style=\"color: #8B4513; margin-top: 0;\">${product.name}</h3>
                        ${product.current_price ? `<p><strong>Pris:</strong> ${product.current_price} kr</p>` : ''}
                        ${product.description ? `<p><strong>Beskrivelse:</strong> ${product.description}</p>` : ''}
                        ${product.url ? `<p><a href=\"${product.url}\" style=\"color: #8B4513;\">Vis produkt</a></p>` : ''}
                    </div>
                    <p>Køyr og bestill før det blir utsolgt! ☕</p>
                `;
                
                text += `Hei!\n\nEin av dine favorittkaffiar er no tilgjengeleg:\n\n`;
                text += `${product.name}\n`;
                if (product.current_price) text += `Pris: ${product.current_price} kr\n`;
                if (product.description) text += `Beskrivelse: ${product.description}\n`;
                if (product.url) text += `URL: ${product.url}\n`;
                text += `\nBestill før det blir utsolgt! ☕`;
                break;

            case 'new_products':
                html += `
                    <p>Hei!</p>
                    <p>${message.products.length} nye kaffiprodukt er oppdaga:</p>
                    <div style=\"background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;\">
                `;
                
                text += `Hei!\n\n${message.products.length} nye kaffiprodukt er oppdaga:\n\n`;
                
                message.products.forEach((product, index) => {
                    html += `
                        <div style=\"margin-bottom: 15px; ${index > 0 ? 'border-top: 1px solid #ddd; padding-top: 15px;' : ''}\">
                            <h4 style=\"color: #8B4513; margin: 0;\">${product.name}</h4>
                            ${product.current_price ? `<p style=\"margin: 5px 0;\"><strong>Pris:</strong> ${product.current_price} kr</p>` : ''}
                            ${product.url ? `<p style=\"margin: 5px 0;\"><a href=\"${product.url}\" style=\"color: #8B4513;\">Vis produkt</a></p>` : ''}
                        </div>
                    `;
                    
                    text += `${product.name}\n`;
                    if (product.current_price) text += `Pris: ${product.current_price} kr\n`;
                    if (product.url) text += `URL: ${product.url}\n`;
                    text += `\n`;
                });
                
                html += `</div>`;
                break;

            case 'error':
                html += `
                    <p>Det oppstod ein feil i coffee monitor:</p>
                    <div style=\"background-color: #ffe6e6; padding: 15px; border-radius: 5px; margin: 20px 0;\">
                        <p><strong>Feil:</strong> ${message.error.message}</p>
                        ${message.context ? `<p><strong>Kontekst:</strong> ${message.context}</p>` : ''}
                    </div>
                `;
                
                text += `Det oppstod ein feil i coffee monitor:\n\n`;
                text += `Feil: ${message.error.message}\n`;
                if (message.context) text += `Kontekst: ${message.context}\n`;
                break;
        }

        html += `
            <p style=\"color: #666; font-size: 12px; margin-top: 30px;\">
                Sendt frå Coffee Monitor
            </p>
        </div>
        `;

        return { html, text };
    }

    async sendDesktopNotification(message) {
        try {
            // Use notify-send on Linux
            const title = message.title.replace(/"/g, '\\"');
            const body = message.body.replace(/"/g, '\\"');
            
            const command = `notify-send "${title}" "${body}" --icon=dialog-information --app-name="Coffee Monitor"`;
            
            return new Promise((resolve) => {
                exec(command, (error) => {
                    if (error) {
                        console.error('Desktop notification failed:', error.message);
                        resolve(false);
                    } else {
                        console.log('Desktop notification sent');
                        resolve(true);
                    }
                });
            });
        } catch (error) {
            console.error('Failed to send desktop notification:', error);
            return false;
        }
    }

    async sendTelegramNotification(message) {
        // Placeholder for Telegram notifications
        // Would need telegram bot setup
        console.log('Telegram notification (not implemented):', message.title);
        return false;
    }

    async close() {
        if (this.emailTransporter) {
            this.emailTransporter.close();
        }
    }
}

module.exports = Notifier;