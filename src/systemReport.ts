import axios from "axios";

export class SystemReport {

    private readonly CHAT_ID: number = -973615089;
    private readonly TOKEN: string = '6178938037:AAEqfi5QOy5iMoL_9SxdduEJ1VPNs77_g8o';

    constructor() {
        this.sendMessageToSystemReport();
    }

    private async sendMessageToSystemReport() {
        try {
            const time = new Date();
            const formateTime = time.toLocaleDateString() + " " + time.toLocaleTimeString();
            await axios.post(
                `https://api.telegram.org/bot${this.TOKEN}/sendMessage`,
                {
                    chat_id: this.CHAT_ID,
                    text: `====== GAME SERVER WAS CRASHED ======\n====== AT: ${formateTime} ======`,
                }
            );
        } catch (error: any) {
            throw new Error(error);
        }
    }
}