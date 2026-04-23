import firestore from '@react-native-firebase/firestore'
import auth from '@react-native-firebase/auth'

class ErrorLogger {
  constructor() {
    this.queue = []
    this.originalConsoleError = console.error
    this.setupGlobalHandler()
  }

  setupGlobalHandler() {
    // Captura console.error
    console.error = (...args) => {
      this.originalConsoleError(...args)
      const message = args.map(a =>
        typeof a === 'object' ? JSON.stringify(a) : String(a)
      ).join(' ')
      this.log('console.error', message)
    }

    // Captura erros não tratados
    if (global.ErrorUtils) {
      const originalHandler = global.ErrorUtils.getGlobalHandler()
      global.ErrorUtils.setGlobalHandler((error, isFatal) => {
        this.log(isFatal ? 'FATAL' : 'ERROR', error?.message || String(error), error?.stack)
        originalHandler?.(error, isFatal)
      })
    }
  }

  log(type, message, stack = '') {
    const uid = auth().currentUser?.uid || 'anonymous'
    const entry = {
      type,
      message: message?.substring(0, 500) || '',
      stack: stack?.substring(0, 500) || '',
      uid,
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0]
    }

    this.queue.push(entry)

    // Salva no Firestore
    this.saveToFirestore(entry)
  }

  async saveToFirestore(entry) {
    try {
      const today = new Date().toISOString().split('T')[0]
      await firestore()
        .collection('errorLogs')
        .doc(today)
        .collection('errors')
        .add(entry)
    } catch (e) {
      // Silencia erros do próprio logger
    }
  }

  // Chama isso uma vez por dia para enviar o resumo
  async sendDailyReport() {
    const today = new Date().toISOString().split('T')[0]

    try {
      const snap = await firestore()
        .collection('errorLogs')
        .doc(today)
        .collection('errors')
        .get()

      if (!snap || snap.empty) {
        console.log('✅ Nenhum erro hoje!')
        return
      }

      const errors = snap.docs.map(d => d.data())
      const grouped = {}

      errors.forEach(err => {
        const key = err.message?.substring(0, 100) || 'unknown'
        if (!grouped[key]) {
          grouped[key] = { ...err, count: 0 }
        }
        grouped[key].count++
      })

      const errorList = Object.values(grouped)
        .sort((a, b) => b.count - a.count)
        .map(err => `
          <tr>
            <td style="padding:8px;border:1px solid #ddd">${err.type}</td>
            <td style="padding:8px;border:1px solid #ddd">${err.message}</td>
            <td style="padding:8px;border:1px solid #ddd;text-align:center">${err.count}x</td>
            <td style="padding:8px;border:1px solid #ddd">${err.uid}</td>
          </tr>
        `).join('')

      const html = `
        <h2>📱 Vyro Android — Log de Erros</h2>
        <p><strong>Data:</strong> ${today}</p>
        <p><strong>Total de erros:</strong> ${errors.length}</p>
        <p><strong>Erros únicos:</strong> ${Object.keys(grouped).length}</p>
        <br>
        <table style="border-collapse:collapse;width:100%">
          <thead>
            <tr style="background:#4A6FE8;color:white">
              <th style="padding:8px">Tipo</th>
              <th style="padding:8px">Mensagem</th>
              <th style="padding:8px">Qtd</th>
              <th style="padding:8px">UID</th>
            </tr>
          </thead>
          <tbody>${errorList}</tbody>
        </table>
        <br>
        <p style="color:#999;font-size:12px">Enviado automaticamente pelo Vyro às ${new Date().toLocaleTimeString('pt-BR')}</p>
      `

      // Envia via Cloud Function
      await fetch('https://us-central1-nutrimarket.cloudfunctions.net/sendVerificationRequest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: 'Sistema Vyro',
          username: 'vyro_android',
          userEmail: 'sistema@vyro.app',
          userId: 'system',
          customSubject: `📱 Vyro Android — ${errors.length} erros em ${today}`,
          customHtml: html
        })
      })

      console.log('✅ Relatório de erros enviado!')
    } catch (e) {
      console.log('Erro ao enviar relatório:', e)
    }
  }
}

export default new ErrorLogger()