# Contrato relógio ⇄ side service

Mensagem `sync` (relógio → celular): `{ entries: QueueItem[] }`
Resposta: `{ synced: string[], today?: Today, sensorMode: 'health-connect' | 'direct', error?: string }` — `synced` só contém ids confirmados pelo servidor, mais os ids de `health` descartados fora do modo `direct` (o relógio os tira da fila). `sensorMode` vem também na resposta de erro.

## QueueItem.data por `type`
| type | data |
|---|---|
| water | `{ container_id, change: 1 \| -1 }` |
| meds | `{ medication_id, status: 'taken'\|'skipped'\|'prn_taken', schedule_id?, scheduled_for?, dose_amount?, dose_unit? }` |
| cycle | `{ flow_level }` |
| food | `{ food_id, variant_id, quantity, unit, meal_type_id, name }` |
| mood | `{ mood_value: 1..5 }` |
| symptom | `{ symptom_id, name }` |
| fast_start | `{ fasting_type, target_end_time }` |
| fast_end | `{}` |
| health | `{ type: 'steps'\|'active_calories'\|'resting_heart_rate'\|'SleepSession', value, ...extra }`. Só é enfileirado com `today.sensorMode === 'direct'`; fora dele o celular não envia, mas confirma o id |

## Today (cache `today` no relógio)
```
{
  date,
  calories: { eaten, burned, remaining, goal },
  macros: { protein: {value, goal}, carbs: {...}, fat: {...}, fiber: {...} },
  water: { ml, goal_ml },
  containers: [{ id, name, volume, unit, volume_ml, is_primary }],
  doses: [{ medication_id, schedule_id, scheduled_for (ISO), label, dose_amount, dose_unit, done }],  // hoje + amanhã
  medications: [{ id, name, dose_amount, dose_unit }],   // ativos, para registro avulso (PRN)
  cycle: { phase, cycleDay, isLate } | null,
  flowLevels: ['none','spotting','light','medium','heavy'],
  fasting: { start_time, target_end_time, fasting_type, status } | null,
  fastingPrefs: { fasting_type, hours } | null,
  symptoms: [{ id, name }],
  foods: [{ food_id, name, variant_id, quantity, unit }],  // favoritos, recentes, mais usados (sem duplicar)
  mealTypes: [{ id, name }],
  sensorMode: 'health-connect' | 'direct'  // configuração do app Zepp; ausente no cache antigo = 'health-connect'
}
```
