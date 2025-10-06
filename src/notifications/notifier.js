const nodemailer = require('nodemailer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

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
                // Silently disable email notifications if initialization fails
                this.emailTransporter = null;
                this.config.email.enabled = false;
            }
        } else {
            // Email is disabled or not configured
            this.emailTransporter = null;
        }
    }

    async notify(type, data) {
        const notifications = [];

        switch (type) {
            case 'favorite_available':
                notifications.push(...await this.notifyFavoriteAvailable(data));
                break;
            case 'favorites_available_grouped':
                notifications.push(...await this.notifyFavoritesAvailableGrouped(data));
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

        // Telegram notification
        if (this.config.telegram?.enabled) {
            try {
                const telegramSent = await this.sendTelegramNotification(message, 'favorite');
                if (telegramSent) {
                    notifications.push({ type: 'telegram', success: true, message: 'Telegram notification sent' });
                }
            } catch (error) {
                notifications.push({ type: 'telegram', success: false, error: error.message });
            }
        }

        return notifications;
    }

    async notifyFavoritesAvailableGrouped(data) {
        const { favorites } = data;
        const notifications = [];

        if (favorites.length === 0) return notifications;

        const message = {
            title: `☕ ${favorites.length} Favorittkaffiar tilgjengelege!`,
            body: `${favorites.length} av dine favorittkaffiar er no tilgjengelege hjå ${this.config.roastery?.name || 'eit kaffibrenneri'}!`,
            favorites: favorites
        };

        // Email notification
        if (this.config.email?.enabled) {
            try {
                const emailSent = await this.sendEmailNotification(message, 'favorites_grouped');
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

        // Telegram notification
        if (this.config.telegram?.enabled) {
            try {
                const telegramSent = await this.sendTelegramNotification(message, 'favorites_grouped');
                if (telegramSent) {
                    notifications.push({ type: 'telegram', success: true, message: 'Telegram notification sent' });
                }
            } catch (error) {
                notifications.push({ type: 'telegram', success: false, error: error.message });
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

        // Telegram notification
        if (this.config.telegram?.enabled) {
            try {
                const telegramSent = await this.sendTelegramNotification(message, 'new_products');
                if (telegramSent) {
                    notifications.push({ type: 'telegram', success: true, message: 'Telegram notification sent' });
                }
            } catch (error) {
                notifications.push({ type: 'telegram', success: false, error: error.message });
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

        // Send error notifications via email and telegram
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

        // Telegram error notification
        if (this.config.telegram?.enabled) {
            try {
                const telegramSent = await this.sendTelegramNotification(message, 'error');
                if (telegramSent) {
                    notifications.push({ type: 'telegram', success: true, message: 'Error Telegram notification sent' });
                }
            } catch (error) {
                notifications.push({ type: 'telegram', success: false, error: error.message });
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

            case 'favorites_grouped':
                html += `
                    <p>Hei! 🎉</p>
                    <p>${message.favorites.length} av dine favorittkaffiar er no tilgjengelege:</p>
                    <div style=\"background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;\">
                `;
                
                text += `Hei! 🎉\n\n${message.favorites.length} av dine favorittkaffiar er no tilgjengelege:\n\n`;
                
                message.favorites.forEach((favoriteData, index) => {
                    const product = favoriteData.product;
                    html += `
                        <div style=\"margin-bottom: 15px; ${index > 0 ? 'border-top: 1px solid #ddd; padding-top: 15px;' : ''}\">
                            <h4 style=\"color: #8B4513; margin: 0;\">${product.name}</h4>
                            ${product.current_price ? `<p style=\"margin: 5px 0;\"><strong>Pris:</strong> ${product.current_price} kr</p>` : ''}
                            <p style=\"margin: 5px 0; font-style: italic; color: #666;\">Matches: ${favoriteData.favoriteName}</p>
                            ${product.url ? `<p style=\"margin: 5px 0;\"><a href=\"${product.url}\" style=\"color: #8B4513;\">Vis produkt</a></p>` : ''}
                        </div>
                    `;
                    
                    text += `${product.name}\n`;
                    if (product.current_price) text += `Pris: ${product.current_price} kr\n`;
                    text += `Matches: ${favoriteData.favoriteName}\n`;
                    if (product.url) text += `URL: ${product.url}\n`;
                    text += `\n`;
                });
                
                html += `</div><p>Køyr og bestill før dei blir utsolgt! ☕</p>`;
                text += `Køyr og bestill før dei blir utsolgt! ☕`;
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

    async sendTelegramNotification(message, templateType = 'basic') {
        if (!this.config.telegram?.enabled || !this.config.telegram.botToken || !this.config.telegram.chatId) {
            return false;
        }

        try {
            const text = this.generateTelegramMessage(message, templateType);
            const success = await this.sendTelegramMessage(text);
            if (success) {
                console.log('Telegram notification sent successfully');
                return true;
            }
        } catch (error) {
            console.error('Failed to send Telegram notification:', error.message);
        }
        return false;
    }

    generateTelegramMessage(message, templateType) {
        // Start with empty text - don't duplicate the title
        let text = '';
        
        // Debug logging removed

        switch (templateType) {
            case 'favorite':
                const product = message.product;
                text += `Hei! 🎉\n\n`;
                text += `Ein av dine favorittkaffiar er no tilgjengeleg:\n\n`;
                text += `☕ *${product.name}*\n`;
                if (product.current_price) text += `💰 Pris: ${product.current_price} kr\n`;
                if (product.description) text += `📝 ${product.description}\n`;
                if (product.url) text += `🔗 [Vis produkt](${product.url})\n`;
                text += `\n🚀 Bestill før det blir utsolgt!`;
                break;

            case 'favorites_grouped':
                // Validate that we have favorites array
                if (!message.favorites || !Array.isArray(message.favorites) || message.favorites.length === 0) {
                    text = `Favorittkaffiar tilgjengelege!`;
                    break;
                }
                
                text = `☕ ${message.favorites.length} favorittkaffiar tilgjengelege!\n\n`;
                
                message.favorites.forEach((favoriteData, index) => {
                    if (!favoriteData || !favoriteData.product) {
                        return;
                    }
                    
                    const product = favoriteData.product;
                    const baseName = favoriteData.baseName || this.getBaseProductName(product.name);
                    
                    // Add organic indicator
                    const organicIndicator = product.organic ? '🌱 ' : '';
                    
                    text += `${index + 1}. ${organicIndicator}${baseName}\n`;
                    
                    // Show available sizes with prices
                    if (favoriteData.availableSizes && favoriteData.availableSizes.length > 0) {
                        favoriteData.availableSizes.forEach(size => {
                            const pricePerSize = this.getPriceForSize(favoriteData, size);
                            if (pricePerSize) {
                                const pricePer250g = this.calculatePricePer250g(pricePerSize, size);
                                text += `   💰 ${size}: ${pricePerSize} kr`;
                                if (pricePer250g) {
                                    text += ` (${pricePer250g} kr/250g)`;
                                }
                                text += `\n`;
                            }
                        });
                    } else {
                        // Fallback to showing the single product price
                        if (product.current_price) {
                            const size = this.extractSizeFromName(product.name);
                            const pricePer250g = this.calculatePricePer250g(product.current_price, size);
                            text += `   💰 ${product.current_price} kr`;
                            if (pricePer250g) {
                                text += ` (${pricePer250g} kr/250g)`;
                            }
                            text += `\n`;
                        }
                    }
                    
                    if (favoriteData.favoriteName) text += `⭐ ${favoriteData.favoriteName}\n`;
                    text += `\n`;
                });
                
                text += `🚀 Sjekk nettsida!`;
                break;

            case 'new_products':
                text += `Hei! 🆕\n\n`;
                text += `${message.products.length} nye kaffiprodukt er oppdaga:\n\n`;
                
                message.products.slice(0, 10).forEach((product, index) => {
                    text += `${index + 1}. *${product.name}*\n`;
                    if (product.current_price) text += `   💰 ${product.current_price} kr\n`;
                    if (product.url) text += `   🔗 [Vis produkt](${product.url})\n`;
                    text += `\n`;
                });
                
                if (message.products.length > 10) {
                    text += `... og ${message.products.length - 10} fleire produkt!\n`;
                }
                break;

            case 'error':
                text += `⚠️ Det oppstod ein feil i coffee monitor:\n\n`;
                text += `🔴 *Feil:* ${message.error.message}\n`;
                if (message.context) text += `📋 *Kontekst:* ${message.context}\n`;
                break;

            default:
                text += message.body || 'Coffee Monitor notification';
        }

        // Debug logging removed
        
        return text;
    }

    sendTelegramMessage(text) {
        return new Promise((resolve) => {
            // Validate text is not empty or just whitespace
            if (!text || text.trim().length === 0) {
                console.error('Telegram message text is empty, aborting send');
                resolve(false);
                return;
            }
            
            // Send the message to Telegram
            
            // Check message length (Telegram limit is 4096 characters)
            if (text.length > 4096) {
                console.warn(`Telegram message too long (${text.length} chars), truncating to 4000 chars`);
                text = text.substring(0, 4000) + '...';
            }
            
            // Only remove markdown formatting, keep Norwegian characters and emojis
            text = text.replace(/\*/g, ''); // Remove markdown asterisks
            text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // Convert markdown links to plain text
            
            const data = JSON.stringify({
                chat_id: parseInt(this.config.telegram.chatId, 10),
                text: text
            });
            
            // JSON data prepared for Telegram API
            
            // Data prepared for Telegram API

            const options = {
                hostname: 'api.telegram.org',
                port: 443,
                path: `/bot${this.config.telegram.botToken}/sendMessage`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Content-Length': Buffer.byteLength(data, 'utf8')
                }
            };

            const req = https.request(options, (res) => {
                let responseData = '';
                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const response = JSON.parse(responseData);
                        if (response.ok) {
                            resolve(true);
                        } else {
                            console.error('Telegram API error:', response.description);
                            resolve(false);
                        }
                    } catch (error) {
                        console.error('Error parsing Telegram response:', error.message);
                        resolve(false);
                    }
                });
            });

            req.on('error', (error) => {
                console.error('Telegram request error:', error.message);
                resolve(false);
            });

            req.write(data);
            req.end();
        });
    }

    getPriceForSize(favoriteData, targetSize) {
        // Check if we have stored size data
        if (favoriteData.sizeData && favoriteData.sizeData[targetSize]) {
            return favoriteData.sizeData[targetSize].price;
        }
        
        // Fallback: check if the main product matches the target size
        const product = favoriteData.product;
        const productSize = this.extractSizeFromName(product.name);
        
        if (productSize === targetSize) {
            return product.current_price;
        }
        
        return null;
    }

    extractSizeFromName(productName) {
        if (!productName) return null;
        const name = productName.toLowerCase();
        if (name.includes('250g') || name.includes('250 g')) {
            return '250g';
        }
        if (name.includes('1kg') || name.includes('1 kg') || name.includes('1000g')) {
            return '1kg';
        }
        return null;
    }

    getBaseProductName(productName) {
        // Remove size indicators and common suffixes to get the base product name
        let baseName = productName
            .replace(/\s*,\s*\d+kg.*$/i, '')  // Remove ", 1kg ..." and everything after
            .replace(/\s*,\s*\d+g.*$/i, '')   // Remove ", 250g ..." and everything after
            .replace(/\s+\d+kg\s+.*$/i, '')   // Remove " 1kg ..." and everything after
            .replace(/\s+\d+g\s+.*$/i, '')    // Remove " 250g ..." and everything after
            .replace(/\s*\d+kg$/i, '')        // Remove " 1kg" at end
            .replace(/\s*\d+g$/i, '')         // Remove " 250g" at end
            .trim();
        
        return baseName;
    }

    calculatePricePer250g(price, size) {
        if (!price || !size) return null;
        
        let grams;
        if (size === '250g') {
            grams = 250;
        } else if (size === '1kg') {
            grams = 1000;
        } else {
            return null;
        }
        
        const pricePer250g = (price / grams) * 250;
        return Math.round(pricePer250g); // Round to nearest kr
    }

    async close() {
        if (this.emailTransporter) {
            this.emailTransporter.close();
        }
    }
}

module.exports = Notifier;
