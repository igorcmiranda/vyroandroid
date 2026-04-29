package com.vyroandroid

import android.os.Bundle
import android.text.Html
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class HealthConnectPrivacyActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 48, 48, 48)
        }

        val titleView = TextView(this).apply {
            text = "Dados de Saúde — Política de Privacidade"
            textSize = 20f
            setTextColor(android.graphics.Color.parseColor("#111111"))
            setPadding(0, 0, 0, 24)
            gravity = Gravity.CENTER_HORIZONTAL
        }

        val html = """
            <h3>Como o Vyro usa seus dados de saúde</h3>
            <p>O Vyro solicita acesso aos seguintes dados do Health Connect:</p>
            <ul>
                <li><b>Passos</b> — para acompanhar sua atividade diária</li>
                <li><b>Calorias ativas</b> — para calcular seu gasto energético</li>
                <li><b>Distância</b> — para medir sua movimentação</li>
            </ul>
            <h3>O que fazemos com esses dados</h3>
            <ul>
                <li>Exibimos seus dados na aba de Progresso dentro do app</li>
                <li>Calculamos sua pontuação nos desafios de atividade</li>
                <li>Nunca vendemos seus dados de saúde</li>
                <li>Nunca compartilhamos com terceiros sem sua permissão</li>
            </ul>
            <h3>Armazenamento</h3>
            <p>
                Seus dados de saúde são lidos em tempo real do Health Connect
                e exibidos apenas localmente no app. Não armazenamos histórico
                de saúde em nossos servidores.
            </p>
            <h3>Seus direitos</h3>
            <p>
                Você pode revogar as permissões a qualquer momento acessando
                Configurações > Privacidade > Health Connect no seu dispositivo.
            </p>
            <p><small>Para mais informações, acesse vyro.app/privacidade</small></p>
        """.trimIndent()

        val contentView = TextView(this).apply {
            text = Html.fromHtml(html, Html.FROM_HTML_MODE_COMPACT)
            textSize = 15f
            setTextColor(android.graphics.Color.parseColor("#333333"))
            setLineSpacing(4f, 1.4f)
        }

        layout.addView(titleView)
        layout.addView(contentView)

        setContentView(ScrollView(this).apply { addView(layout) })

        supportActionBar?.apply {
            title = "Privacidade — Dados de Saúde"
            setDisplayHomeAsUpEnabled(true)
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }
}
