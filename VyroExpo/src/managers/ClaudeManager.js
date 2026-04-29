import { CLAUDE_API_KEY, CLAUDE_MODEL } from '../config/Secrets'

class ClaudeManager {

  async callClaude(messages, maxTokens = 1000) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        messages
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Claude API error: ${error}`)
    }

    const data = await response.json()
    return data.content[0].text
  }

  // Converte imagem URI para base64
  async imageToBase64(uri) {
    const response = await fetch(uri)
    const blob = await response.blob()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  // ─────────────────────────────────────
  // ANÁLISE DE REFEIÇÃO
  // ─────────────────────────────────────
  async analyzeMeal(imageUri, userProfile = {}) {
    const base64 = await this.imageToBase64(imageUri)

    const prompt = `Você é um nutricionista especialista. Analise esta imagem de refeição e retorne APENAS um JSON válido sem markdown, sem explicações adicionais.

Perfil do usuário:
- Sexo: ${userProfile.sex || 'não informado'}
- Objetivo: ${userProfile.goal || 'não informado'}
- Peso: ${userProfile.weight || 0}kg

Retorne exatamente neste formato:
{
  "description": "descrição breve da refeição",
  "calories": 0,
  "protein": 0,
  "carbs": 0,
  "fat": 0,
  "fiber": 0,
  "mealType": "Almoço",
  "quality": "Boa",
  "tips": "dica personalizada baseada no objetivo do usuário"
}`

    const text = await this.callClaude([
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: base64
            }
          },
          { type: 'text', text: prompt }
        ]
      }
    ])

    const cleaned = text.replace(/```json|```/g, '').trim()
    return JSON.parse(cleaned)
  }

  // ─────────────────────────────────────
  // GERAÇÃO DE DIETA
  // ─────────────────────────────────────
  async generateDietPlan(userProfile, preferences = {}, mealSchedule = {}) {
  const hasMealSchedule = Object.values(mealSchedule).some(v => v)

  const mealInfo = hasMealSchedule ? `
Refeições que o usuário já faz habitualmente:
- Café da manhã: ${mealSchedule.cafeDaManha || 'não informado'}
- Lanche da manhã: ${mealSchedule.lancheManha || 'não informado'}
- Almoço: ${mealSchedule.almoco || 'não informado'}
- Café da tarde: ${mealSchedule.cafeDaTarde || 'não informado'}
- Lanche da tarde: ${mealSchedule.lancheTarde || 'não informado'}
- Janta: ${mealSchedule.janta || 'não informado'}
- Ceia: ${mealSchedule.ceia || 'não informado'}
- Horário do treino: ${mealSchedule.horarioTreino || 'não informado'}
- Tipo de treino: ${mealSchedule.tipoTreino || 'não informado'}

IMPORTANTE: Baseie a dieta no que o usuário já come, ajustando quantidades e substituições para bater a meta calórica. Não mude completamente os alimentos — adapte o que ele já consome.
${mealSchedule.horarioTreino && mealSchedule.horarioTreino !== 'não treino' ? 'Inclua recomendações específicas de pré-treino e pós-treino.' : ''}
` : ''

  const prompt = `Você é um nutricionista especialista. Crie um plano alimentar personalizado e retorne APENAS um JSON válido sem markdown.

Dados do usuário:
- Nome: ${userProfile.name}
- Sexo: ${userProfile.sex}
- Idade: ${userProfile.age} anos
- Peso: ${userProfile.weight}kg
- Altura: ${userProfile.height}cm
- Objetivo: ${userProfile.goal}
- Alimentos que gosta: ${preferences.liked || 'não informado'}
- Alimentos que não gosta: ${preferences.disliked || 'não informado'}
- Restrições: ${preferences.restrictions || 'nenhuma'}

${mealInfo}

Retorne neste formato:
{
  "dailyCalories": 0,
  "macros": { "protein": 0, "carbs": 0, "fat": 0 },
  "preTreino": "recomendação pré-treino",
  "posTreino": "recomendação pós-treino",
  "meals": [
    {
      "name": "Café da manhã",
      "time": "07:00",
      "foods": ["item 1 - quantidade", "item 2 - quantidade"],
      "calories": 0,
      "notes": "dica"
    }
  ],
  "tips": ["dica 1", "dica 2", "dica 3"],
  "weeklyPlan": {
    "segunda": ["refeição 1", "refeição 2"],
    "terca": ["refeição 1", "refeição 2"],
    "quarta": ["refeição 1", "refeição 2"],
    "quinta": ["refeição 1", "refeição 2"],
    "sexta": ["refeição 1", "refeição 2"],
    "sabado": ["refeição 1", "refeição 2"],
    "domingo": ["refeição 1", "refeição 2"]
  }
}`

  const text = await this.callClaude([
    { role: 'user', content: prompt }
  ], 2000)

  const cleaned = text.replace(/```json|```/g, '').trim()
  return JSON.parse(cleaned)
}

async generateWorkoutPlan(bodyAnalysis, userProfile = {}) {
  const prompt = `Você é um personal trainer especialista. Crie um plano de treino semanal personalizado e retorne APENAS um JSON válido sem markdown.

Dados da análise corporal:
- % Gordura: ${bodyAnalysis.fatPercentageLow}% — ${bodyAnalysis.fatPercentageHigh}%
- Categoria: ${bodyAnalysis.fatCategory}
- Definição muscular: ${bodyAnalysis.muscleDefinition}
- Tipo corporal: ${bodyAnalysis.bodyType}
- Recomendação: ${bodyAnalysis.recommendation}

Dados do usuário:
- Sexo: ${userProfile?.sex || 'não informado'}
- Idade: ${userProfile?.age || 0} anos
- Peso: ${userProfile?.weight || 0}kg
- Altura: ${userProfile?.height || 0}cm
- Objetivo: ${userProfile?.goal || 'não informado'}

Retorne neste formato:
{
  "objetivo": "descrição do objetivo do treino",
  "weeklyPlan": {
    "segunda": { "focus": "Peito e Tríceps", "exercises": ["Supino reto 4x12", "Supino inclinado 3x10", "Crucifixo 3x12", "Tríceps corda 4x12", "Tríceps testa 3x12"], "duration": "60 min" },
    "terca": { "focus": "Costas e Bíceps", "exercises": ["Puxada frontal 4x12", "Remada curvada 4x10", "Remada unilateral 3x12", "Rosca direta 4x12", "Rosca martelo 3x12"], "duration": "60 min" },
    "quarta": { "focus": "Descanso ativo", "exercises": ["Caminhada 30 minutos", "Alongamento 15 minutos"], "duration": "45 min" },
    "quinta": { "focus": "Pernas", "exercises": ["Agachamento livre 4x12", "Leg press 4x15", "Extensora 3x15", "Flexora 3x15", "Panturrilha 4x20"], "duration": "70 min" },
    "sexta": { "focus": "Ombros e Abdômen", "exercises": ["Desenvolvimento com barra 4x12", "Elevação lateral 4x15", "Elevação frontal 3x12", "Abdominal supra 4x20", "Prancha 3x45s"], "duration": "55 min" },
    "sabado": { "focus": "Cardio e Full Body", "exercises": ["Corrida 30 minutos ou bicicleta 40 minutos"], "duration": "40 min" },
    "domingo": { "focus": "Descanso", "exercises": [], "duration": "0 min" }
  },
  "tips": ["dica 1", "dica 2", "dica 3"]
}`

  const text = await this.callClaude([
    { role: 'user', content: prompt }
  ], 2000)

  const cleaned = text.replace(/```json|```/g, '').trim()
  return JSON.parse(cleaned)
}

  // ─────────────────────────────────────
  // ANÁLISE CORPORAL
  // ─────────────────────────────────────
  async analyzeBody(imageUri, userProfile = {}) {
    const base64 = await this.imageToBase64(imageUri)

    const prompt = `Você é um personal trainer e especialista em composição corporal. Analise esta foto corporal e retorne APENAS um JSON válido sem markdown.

IMPORTANTE: Esta é uma estimativa visual educacional, não um diagnóstico médico.

Dados do usuário:
- Sexo: ${userProfile.sex}
- Idade: ${userProfile.age} anos
- Peso: ${userProfile.weight}kg
- Altura: ${userProfile.height}cm

Retorne neste formato:
{
  "fatPercentageLow": 0,
  "fatPercentageHigh": 0,
  "fatCategory": "Normal",
  "muscleDefinition": "Moderada",
  "bodyType": "Mesomorfo",
  "recommendation": "recomendação personalizada",
  "weeklyWorkoutPlan": {
    "segunda": { "focus": "Peito e Tríceps", "exercises": ["Supino reto 3x12", "Desenvolvimento 3x12"], "duration": "60 min" },
    "terca": { "focus": "Costas e Bíceps", "exercises": ["Puxada 3x12", "Remada 3x10"], "duration": "60 min" },
    "quarta": { "focus": "Descanso ativo", "exercises": ["Caminhada 30min"], "duration": "30 min" },
    "quinta": { "focus": "Pernas", "exercises": ["Agachamento 4x12", "Leg press 3x15"], "duration": "70 min" },
    "sexta": { "focus": "Ombros e Abdômen", "exercises": ["Desenvolvimento 3x12", "Abdominal 3x20"], "duration": "50 min" },
    "sabado": { "focus": "Cardio", "exercises": ["Corrida 30min ou Bicicleta 40min"], "duration": "40 min" },
    "domingo": { "focus": "Descanso", "exercises": [], "duration": "0 min" }
  },
  "nutritionTips": ["dica 1", "dica 2", "dica 3"]
}`

    const text = await this.callClaude([
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: base64
            }
          },
          { type: 'text', text: prompt }
        ]
      }
    ], 2000)

    const cleaned = text.replace(/```json|```/g, '').trim()
    return JSON.parse(cleaned)
  }
}

export default new ClaudeManager()
