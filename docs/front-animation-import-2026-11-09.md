# Animazioni frontali del 9 novembre 2026

Sono stati aggiunti set per le forme **146–148 e 151–156** e sostituite le cinque clip della **149**. Ogni forma ha attesa, attacco, reazione, vittoria e KO. I 50 video forniti sono 1920×1080 e contengono 94 fotogrammi ciascuno a 24 FPS. Sono stati aggiornati anche i PNG ufficiali delle forme 146, 147, 148, 149 e 151.

Il laboratorio mostra le 46 forme animate in attesa di dati di gioco. Il catalogo giocabile comprende 110 forme. Per provare un'animazione, aprire `/#arkamon-lab`, selezionare la forma e scegliere l'azione. Il ritratto ufficiale e l'anteprima animata sono visibili affiancati.

La conversione rimuove lo sfondo verde e mantiene i 4.700 fotogrammi nello stesso ordine e alla stessa frequenza. La posa iniziale segue la scala del ritratto ufficiale. Il margine trasparente esterno conserva movimenti ed effetti. Per la forma 149 il foglio sorgente misura 8.320×8.320 pixel. Il gioco carica le pagine di riproduzione, ciascuna entro 16 MiB decodificati. I lampi di KO delle forme 153 e 155 mostrano bordi già visibili nei video originali. Gli ultimi due fotogrammi del KO di 156 sono trasparenti dopo il keying perché il fumo residuo ha un colore simile al fondale verde.

Le versioni precedenti della forma 149 sono disponibili nella revisione `a014a032479c7474417208d68e478a01d6757be1`. La provenienza, le impronte dei file, i fotogrammi di attacco e reazione e l'esito della verifica di preservazione sono registrati nell'[audit dell'importazione](../animation-source/audits/front-2026-11-09.json).

Il catalogo finale comprende **156 forme animate, 780 clip, 74.405 fotogrammi e 8.085 pagine**. L'audit ha verificato integralmente le 530 pagine delle 50 clip importate e le impronte dei 9.940 file di riferimento. Le 730 clip fuori dall'importazione sono identiche. L'indice delle pagine occupa 36.286 byte gzip, entro il limite di 37.043 calcolato in base al numero di impronte. La build rispetta i limiti fissi di avvio e occupa 742,9 MiB.

Sono passati i **4.528 test Arkamon** e i **10 scenari browser mirati sulla build** con i media locali verificati. La prima esecuzione sul sorgente ha registrato 36 scenari riusciti su 40. Le prove di 146 e 149 hanno raggiunto la scadenza su desktop e mobile durante il caricamento della pagina o delle animazioni. I quattro scenari sono passati nelle ripetizioni con un solo worker e la stessa scadenza. Nel primo giro Playwright ha inoltre dovuto forzare la chiusura di un worker. Questi esiti riguardano la verifica locale dell'importazione.
