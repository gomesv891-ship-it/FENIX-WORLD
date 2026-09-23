/**
 * Gerenciamento de Preferências de Notificação por Usuário
 * Suporta configuração individual de toque sonoro, volume, categorias específicas de alerta e metas periódicas.
 * Persistência sincronizada com LocalStorage e Supabase.
 */

import { NotificationSoundType, playNotificationSound } from './soundAlerts';
import { getSupabaseClient } from './supabaseClient';

export type NotificationCategoryType =
  | 'followup'
  | 'estoque'
  | 'pendencias'
  | 'metas'
  | 'boletos'
  | 'tarefas'
  | 'chat'
  | 'notas'
  | 'outras';

export interface CustomAudioSound {
  fileName: string;
  dataUrl: string; // Base64 data URL (audio/...)
  fileType?: string;
  fileSize?: number; // in bytes
  uploadedAt: string;
  durationTotal?: number; // Duração total do áudio em segundos (ex: 215.4s)
  startTime?: number; // Segundo inicial do trecho na linha do tempo (ex: 35s)
  duration?: number; // Duração livre do trecho em segundos (ex: 2, 5, 10s)
}

/**
 * Normaliza o identificador de usuário para chaves seguras e isoladas.
 * Garante que cada usuário tenha suas próprias configurações 100% independentes.
 */
export function normalizeUserId(userId?: string): string {
  if (!userId || typeof userId !== 'string') return 'padrao';
  const cleaned = userId
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]/g, '_');
  return cleaned || 'padrao';
}

/**
 * Formata segundos no formato MM:SS (ex: 01:25)
 */
export function formatAudioTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const totalSecs = Math.floor(seconds);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Extrai a duração total do áudio a partir do Data URL
 */
export function getAudioDuration(dataUrl: string): Promise<number> {
  return new Promise((resolve) => {
    try {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        const dur = audio.duration;
        if (typeof dur === 'number' && !isNaN(dur) && isFinite(dur) && dur > 0) {
          resolve(Math.round(dur * 10) / 10);
        } else {
          resolve(30);
        }
      };
      audio.onerror = () => resolve(30);
      audio.src = dataUrl;
    } catch {
      resolve(30);
    }
  });
}

export interface UserNotificationPreferences {
  userId: string;
  soundType: NotificationSoundType;
  soundsPerType: Record<NotificationCategoryType, NotificationSoundType>;
  customAudioPerType?: Partial<Record<NotificationCategoryType, CustomAudioSound>>;
  volumePercent: number; // 0 - 100
  // Categorias específicas de alerta
  alerts: {
    pendencias: boolean;
    notas: boolean;
    tarefas: boolean;
    followup: boolean;
    boletos: boolean;
    metas: boolean;
    chat: boolean;
    estoque: boolean;
  };
  // Configurações de percentuais de metas
  metaAlerts: {
    diaria: {
      pct50: boolean;
      pct75: boolean;
      pct100: boolean;
    };
    semanal: {
      pct50: boolean;
      pct75: boolean;
      pct100: boolean;
    };
    mensal: {
      pct50: boolean;
      pct75: boolean;
      pct100: boolean;
    };
  };
}

export const DEFAULT_SOUNDS_PER_TYPE: Record<NotificationCategoryType, NotificationSoundType> = {
  followup: 'Ding Comercial',
  estoque: 'Pulso Tecnológico',
  pendencias: 'Alerta Duplo Atenção',
  metas: 'Fanfarra de Conquista (Meta)',
  boletos: 'Campainha Corporativa (Longa)',
  tarefas: 'Sino Suave (Padrão)',
  chat: 'Pop Discreto',
  notas: 'Chime Cristalino com Ressonância',
  outras: 'Sino Suave (Padrão)',
};

export const DEFAULT_NOTIF_PREFS: Omit<UserNotificationPreferences, 'userId'> = {
  soundType: 'Campainha Corporativa (Longa)',
  soundsPerType: DEFAULT_SOUNDS_PER_TYPE,
  volumePercent: 85,
  alerts: {
    pendencias: true,
    notas: true,
    tarefas: true,
    followup: true,
    boletos: true,
    metas: true,
    chat: true,
    estoque: true,
  },
  metaAlerts: {
    diaria: {
      pct50: true,
      pct75: true,
      pct100: true,
    },
    semanal: {
      pct50: true,
      pct75: true,
      pct100: true,
    },
    mensal: {
      pct50: true,
      pct75: true,
      pct100: true,
    },
  },
};

const STORAGE_PREFIX = 'fenix_user_notif_prefs_';
const CUSTOM_AUDIO_PREFIX = 'fenix_custom_audio_';
const DEDUPLICATION_PREFIX = 'fenix_meta_notif_fired_';

/**
 * Valida se o arquivo é um formato de áudio aceito (MP3, WAV, M4A, OGG) e se o tamanho é adequado.
 */
export function validateAudioFile(file: File): { valid: boolean; format?: string; error?: string } {
  if (!file) {
    return { valid: false, error: 'Nenhum arquivo selecionado.' };
  }

  const name = file.name.toLowerCase();
  const ext = name.split('.').pop() || '';
  const validExtensions = ['mp3', 'wav', 'm4a', 'ogg'];

  const type = (file.type || '').toLowerCase();
  const isAudioType =
    type.includes('audio') ||
    type.includes('mpeg') ||
    type.includes('wav') ||
    type.includes('ogg') ||
    type.includes('mp4') ||
    type.includes('aac');

  if (!validExtensions.includes(ext) && !isAudioType) {
    return {
      valid: false,
      error: 'Formato inválido. Por favor, envie um arquivo nos formatos MP3, WAV, M4A ou OGG.',
    };
  }

  // Limite de 5MB para áudio de notificação para garantir fluidez e persistência confiável
  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return {
      valid: false,
      error: `O arquivo possui ${(file.size / (1024 * 1024)).toFixed(1)}MB. O limite máximo permitido para toques é de 5MB.`,
    };
  }

  const detectedFormat = (ext || type.split('/')[1] || 'audio').toUpperCase();
  return { valid: true, format: detectedFormat };
}

/**
 * Converte um arquivo de áudio (File) em Data URL base64
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Falha ao processar arquivo de áudio'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Erro ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

/**
 * Retorna o áudio personalizado configurado para uma categoria específica do usuário (se houver).
 * Rigorosamente INDIVIDUAL por usuário: a música escolhida por um usuário não altera nem interfere nos outros.
 */
export function getCustomAudioForCategory(
  userId: string,
  category: NotificationCategoryType
): CustomAudioSound | null {
  if (typeof window === 'undefined') return null;
  const uid = normalizeUserId(userId);
  const rawUid = (userId || '').trim();

  // 1. Tentar ler do storage dedicado por categoria usando uid normalizado
  try {
    const raw = localStorage.getItem(`${CUSTOM_AUDIO_PREFIX}${uid}_${category}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.dataUrl) return parsed;
    }
  } catch {}

  // 2. Se não encontrou, tentar com rawUid
  if (rawUid && rawUid !== uid) {
    try {
      const raw = localStorage.getItem(`${CUSTOM_AUDIO_PREFIX}${rawUid}_${category}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.dataUrl) return parsed;
      }
    } catch {}
  }

  // 3. Tentar ler do objeto de preferências do usuário específico
  try {
    const prefs = getUserNotificationPreferences(userId);
    if (prefs?.customAudioPerType?.[category]?.dataUrl) {
      return prefs.customAudioPerType[category] as CustomAudioSound;
    }
  } catch {}

  // IMPORTANTE: NÃO há fallback para 'default' ou outros usuários.
  // Cada usuário visualiza e ouve somente suas próprias configurações, mantendo o padrão se não personalizou.
  return null;
}

/**
 * Salva o áudio personalizado para uma categoria específica do usuário
 */
export function saveCustomAudioForCategory(
  userId: string,
  category: NotificationCategoryType,
  customAudio: CustomAudioSound
): void {
  if (typeof window === 'undefined') return;
  const uid = normalizeUserId(userId);

  try {
    // 1. Armazena no storage dedicado para acesso rápido e isolado por usuário
    localStorage.setItem(
      `${CUSTOM_AUDIO_PREFIX}${uid}_${category}`,
      JSON.stringify(customAudio)
    );

    // 2. Atualiza o objeto de preferências do usuário
    const prefs = getUserNotificationPreferences(userId);
    const updatedCustomAudio: Partial<Record<NotificationCategoryType, CustomAudioSound>> = {
      ...(prefs.customAudioPerType || {}),
      [category]: customAudio,
    };
    saveUserNotificationPreferences({
      ...prefs,
      userId,
      customAudioPerType: updatedCustomAudio,
    });

    window.dispatchEvent(
      new CustomEvent('fenix_custom_audio_updated', {
        detail: { userId, normalizedUserId: uid, category, customAudio },
      })
    );
  } catch (err) {
    console.error('Erro ao salvar áudio personalizado:', err);
  }
}

/**
 * Remove o áudio personalizado e restaura o som padrão do sistema para a categoria
 */
export function removeCustomAudioForCategory(
  userId: string,
  category: NotificationCategoryType
): void {
  if (typeof window === 'undefined') return;
  const uid = normalizeUserId(userId);
  const rawUid = (userId || '').trim();

  try {
    localStorage.removeItem(`${CUSTOM_AUDIO_PREFIX}${uid}_${category}`);
    if (rawUid && rawUid !== uid) {
      localStorage.removeItem(`${CUSTOM_AUDIO_PREFIX}${rawUid}_${category}`);
    }

    const prefs = getUserNotificationPreferences(userId);
    if (prefs.customAudioPerType && prefs.customAudioPerType[category]) {
      const updated = { ...prefs.customAudioPerType };
      delete updated[category];
      saveUserNotificationPreferences({
        ...prefs,
        userId,
        customAudioPerType: updated,
      });
    }

    window.dispatchEvent(
      new CustomEvent('fenix_custom_audio_updated', {
        detail: { userId, normalizedUserId: uid, category, customAudio: null },
      })
    );
  } catch (err) {
    console.error('Erro ao remover áudio personalizado:', err);
  }
}

/**
 * Obtém todos os áudios personalizados do usuário
 */
export function getAllCustomAudioForUser(
  userId: string
): Partial<Record<NotificationCategoryType, CustomAudioSound>> {
  const result: Partial<Record<NotificationCategoryType, CustomAudioSound>> = {};
  const categories: NotificationCategoryType[] = [
    'followup',
    'tarefas',
    'boletos',
    'metas',
    'estoque',
    'outras',
    'pendencias',
    'chat',
    'notas',
  ];

  for (const cat of categories) {
    const audio = getCustomAudioForCategory(userId, cat);
    if (audio) {
      result[cat] = audio;
    }
  }

  return result;
}

/**
 * Obtém as preferências salvas do usuário atual (ou padrão)
 */
export function getUserNotificationPreferences(userId: string): UserNotificationPreferences {
  if (typeof window === 'undefined' || !userId) {
    return { userId: userId || 'default', ...DEFAULT_NOTIF_PREFS };
  }

  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        userId,
        soundType: parsed.soundType || DEFAULT_NOTIF_PREFS.soundType,
        soundsPerType: {
          ...DEFAULT_SOUNDS_PER_TYPE,
          ...(parsed.soundsPerType || {}),
        },
        customAudioPerType: parsed.customAudioPerType || undefined,
        volumePercent: typeof parsed.volumePercent === 'number' ? parsed.volumePercent : DEFAULT_NOTIF_PREFS.volumePercent,
        alerts: {
          ...DEFAULT_NOTIF_PREFS.alerts,
          ...(parsed.alerts || {}),
        },
        metaAlerts: {
          diaria: {
            ...DEFAULT_NOTIF_PREFS.metaAlerts.diaria,
            ...(parsed.metaAlerts?.diaria || {}),
          },
          semanal: {
            ...DEFAULT_NOTIF_PREFS.metaAlerts.semanal,
            ...(parsed.metaAlerts?.semanal || {}),
          },
          mensal: {
            ...DEFAULT_NOTIF_PREFS.metaAlerts.mensal,
            ...(parsed.metaAlerts?.mensal || {}),
          },
        },
      };
    }
  } catch (err) {
    console.warn('Erro ao ler preferências de notificação:', err);
  }

  return { userId, ...DEFAULT_NOTIF_PREFS };
}

/**
 * Salva as preferências no LocalStorage e sincroniza com o Supabase
 */
export async function saveUserNotificationPreferences(
  userIdOrPrefs: string | UserNotificationPreferences,
  optionalPrefs?: UserNotificationPreferences
): Promise<{ success: boolean; error?: string }> {
  if (typeof window === 'undefined') return { success: true };

  const prefs: UserNotificationPreferences =
    typeof userIdOrPrefs === 'string' && optionalPrefs
      ? { ...optionalPrefs, userId: userIdOrPrefs }
      : (userIdOrPrefs as UserNotificationPreferences);

  try {
    const key = `${STORAGE_PREFIX}${prefs.userId}`;
    localStorage.setItem(key, JSON.stringify(prefs));
    window.dispatchEvent(new CustomEvent('fenix_notif_prefs_updated', { detail: prefs }));

    // Sincronizar com o Supabase de forma assíncrona
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.from('fenix_user_preferences').upsert(
          {
            user_id: prefs.userId,
            preference_key: 'notification_settings',
            preference_value: prefs,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,preference_key' }
        );
      } catch (sbErr) {
        console.warn('Aviso: Supabase preferences sync em fallback local:', sbErr);
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('Erro ao salvar preferências de notificação:', err);
    return { success: false, error: err?.message || 'Falha ao salvar' };
  }
}

// Instância de áudio em reprodução para controle de prévia
let currentPreviewAudio: HTMLAudioElement | null = null;
let currentPreviewStopFn: (() => void) | null = null;

/**
 * Interrompe a prévia de áudio atual se estiver tocando
 */
export function stopAudioPreview(): void {
  if (currentPreviewStopFn) {
    try {
      currentPreviewStopFn();
    } catch {}
    currentPreviewStopFn = null;
  }
  if (currentPreviewAudio) {
    try {
      currentPreviewAudio.pause();
      currentPreviewAudio.currentTime = 0;
    } catch {}
    currentPreviewAudio = null;
  }
}

/**
 * Reproduz o trecho desejado na linha do tempo com a duração configurada.
 * Toca RIGOROSAMENTE uma única vez, sem loop.
 */
export function playAudioSnippet(
  dataUrl: string,
  startTime: number = 0,
  duration: number = 5,
  volumePercent: number = 80,
  onEnd?: () => void,
  onTimeUpdate?: (currentTime: number, progressPct: number) => void
): { audio: HTMLAudioElement; stop: () => void } | null {
  if (typeof window === 'undefined' || !dataUrl) return null;

  try {
    // Interrompe prévia anterior se ainda estiver tocando
    stopAudioPreview();

    const audio = new Audio();
    audio.src = dataUrl;
    audio.loop = false; // Toca UMA ÚNICA VEZ, SEM LOOP
    const normalizedVol = Math.max(0, Math.min(100, volumePercent)) / 100;
    audio.volume = normalizedVol;

    let stopTimer: any = null;
    let isStopped = false;

    const stop = () => {
      if (isStopped) return;
      isStopped = true;
      if (stopTimer) {
        clearTimeout(stopTimer);
        stopTimer = null;
      }
      try {
        audio.pause();
      } catch {}
      if (currentPreviewAudio === audio) {
        currentPreviewAudio = null;
        currentPreviewStopFn = null;
      }
      if (onEnd) onEnd();
    };

    audio.onloadedmetadata = () => {
      if (isStopped) return;
      const safeStart = Math.max(0, startTime);
      audio.currentTime = safeStart;
    };

    audio.ontimeupdate = () => {
      if (isStopped) return;
      const current = audio.currentTime;
      const elapsed = Math.max(0, current - startTime);
      const progress = duration > 0 ? Math.min(1, Math.max(0, elapsed / duration)) : 0;
      if (onTimeUpdate) {
        onTimeUpdate(current, progress);
      }
      if (elapsed >= duration || (audio.duration && current >= audio.duration)) {
        stop();
      }
    };

    audio.onended = () => {
      stop();
    };

    audio.play().then(() => {
      if (isStopped) return;
      // Garante parada estrita mesmo se ontimeupdate tiver delay
      const durationMs = Math.max(500, Math.round(duration * 1000 + 150));
      stopTimer = setTimeout(stop, durationMs);
    }).catch((err) => {
      console.warn('Aviso: Reprodução prevenida pelo navegador ou erro no arquivo:', err);
      stop();
    });

    currentPreviewAudio = audio;
    currentPreviewStopFn = stop;

    return { audio, stop };
  } catch (err) {
    console.error('Erro ao reproduzir trecho de áudio:', err);
    return null;
  }
}

/**
 * Reproduz o trecho do áudio para alertas do sistema em background.
 * Totalmente isolado do player de prévia da interface e toca UMA ÚNICA VEZ SEM LOOP.
 */
export function playNotificationAudioSnippet(
  dataUrl: string,
  startTime: number = 0,
  duration: number = 5,
  volumePercent: number = 80
): void {
  if (typeof window === 'undefined' || !dataUrl) return;

  try {
    const audio = new Audio();
    audio.src = dataUrl;
    audio.loop = false; // Toca uma única vez, sem loop
    audio.volume = Math.max(0, Math.min(100, volumePercent)) / 100;

    let isStopped = false;
    let timer: any = null;

    const stop = () => {
      if (isStopped) return;
      isStopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      try {
        audio.pause();
      } catch {}
    };

    audio.onloadedmetadata = () => {
      if (isStopped) return;
      audio.currentTime = Math.max(0, startTime);
    };

    audio.ontimeupdate = () => {
      if (isStopped) return;
      const elapsed = audio.currentTime - startTime;
      if (elapsed >= duration || (audio.duration && audio.currentTime >= audio.duration)) {
        stop();
      }
    };

    audio.onended = () => stop();

    audio.play().then(() => {
      if (isStopped) return;
      const durationMs = Math.max(500, Math.round(duration * 1000 + 200));
      timer = setTimeout(stop, durationMs);
    }).catch((err) => {
      console.warn('Alerta sonoro de notificação prevenido:', err);
      stop();
    });
  } catch (err) {
    console.warn('Erro ao instanciar áudio de notificação:', err);
  }
}

/**
 * Reproduz uma prévia de áudio completa (Data URL) e retorna o elemento de áudio criado para controle
 */
export function playAudioDataUrl(
  dataUrl: string,
  volumePercent: number = 80
): HTMLAudioElement | null {
  const result = playAudioSnippet(dataUrl, 0, 10, volumePercent);
  return result ? result.audio : null;
}

/**
 * Toca o som de notificação personalizado configurado para o usuário
 */
export function playUserCustomSound(userId: string) {
  const prefs = getUserNotificationPreferences(userId);
  if (prefs.volumePercent <= 0) return;

  // Verifica se há som customizado em 'outras'
  const customGeneral = getCustomAudioForCategory(userId, 'outras');
  if (customGeneral?.dataUrl) {
    const start = customGeneral.startTime || 0;
    const dur = customGeneral.duration || 5;
    playNotificationAudioSnippet(customGeneral.dataUrl, start, dur, prefs.volumePercent);
    return;
  }

  playNotificationSound(prefs.soundType, prefs.volumePercent);
}

/**
 * Normaliza qualquer chave ou string de categoria do CRM para a chave padronizada
 */
export function normalizeCategoryKey(category: string): NotificationCategoryType {
  const c = (category || '').toLowerCase().trim();
  if (c === 'follow-up' || c === 'followup' || c === 'follow_up' || c === 'pós-vendas' || c === 'pos-vendas') {
    return 'followup';
  }
  if (c === 'tarefas' || c === 'tarefa' || c === 'agenda') {
    return 'tarefas';
  }
  if (c === 'boletos' || c === 'boleto' || c === 'financeiro') {
    return 'boletos';
  }
  if (c === 'metas' || c === 'meta') {
    return 'metas';
  }
  if (c === 'estoque' || c === 'materiais' || c === 'controle de estoque') {
    return 'estoque';
  }
  if (c === 'notas' || c === 'nota') {
    return 'notas';
  }
  if (c === 'pendências' || c === 'pendencias' || c === 'pendencia') {
    return 'pendencias';
  }
  if (c === 'chat' || c === 'mensagem') {
    return 'chat';
  }
  return 'outras';
}

/**
 * Toca o som de notificação específico para a categoria/tipo de notificação do usuário.
 * Rigorosamente INDIVIDUAL por usuário. Toca uma única vez, sem loop.
 * Prioriza o trecho personalizado (MP3, WAV, M4A, OGG) configurado pelo usuário.
 * Se não houver arquivo, utiliza o som padrão sintetizado configurado.
 */
export function playUserCustomSoundForCategory(
  userId: string,
  category: NotificationCategoryType | string
) {
  const prefs = getUserNotificationPreferences(userId);
  if (prefs.volumePercent <= 0) return;

  const normalizedCat = normalizeCategoryKey(category);

  // Se o som/alerta estiver explicitamente desativado pelo usuário nesta categoria, não reproduz som
  if (prefs.alerts && typeof (prefs.alerts as any)[normalizedCat] === 'boolean') {
    if (!(prefs.alerts as any)[normalizedCat]) {
      return;
    }
  }

  // 1. Tentar tocar o áudio customizado específico da categoria configurado por ESTE usuário
  const customAudio = getCustomAudioForCategory(userId, normalizedCat);
  if (customAudio?.dataUrl) {
    const startTime = typeof customAudio.startTime === 'number' ? Math.max(0, customAudio.startTime) : 0;
    const duration = typeof customAudio.duration === 'number' && customAudio.duration > 0 ? customAudio.duration : 5;

    playNotificationAudioSnippet(customAudio.dataUrl, startTime, duration, prefs.volumePercent);
    return;
  }

  // 2. Se a categoria for secundária (ex: pendencias, notas) e não tiver arquivo próprio,
  // verificar se a categoria 'outras' deste mesmo usuário possui áudio personalizado configurado
  if (
    normalizedCat !== 'followup' &&
    normalizedCat !== 'tarefas' &&
    normalizedCat !== 'boletos' &&
    normalizedCat !== 'metas' &&
    normalizedCat !== 'estoque' &&
    normalizedCat !== 'chat'
  ) {
    const customOutras = getCustomAudioForCategory(userId, 'outras');
    if (customOutras?.dataUrl) {
      const startTime = typeof customOutras.startTime === 'number' ? Math.max(0, customOutras.startTime) : 0;
      const duration = typeof customOutras.duration === 'number' && customOutras.duration > 0 ? customOutras.duration : 5;

      playNotificationAudioSnippet(customOutras.dataUrl, startTime, duration, prefs.volumePercent);
      return;
    }
  }

  // 3. Som padrão do sistema sintetizado (toca uma única vez, sem loop)
  const specificSound =
    prefs.soundsPerType?.[normalizedCat] ||
    prefs.soundsPerType?.['outras'] ||
    prefs.soundType ||
    'Campainha Corporativa (Longa)';
  playNotificationSound(specificSound, prefs.volumePercent);
}

/**
 * Verifica se um alerta específico de categoria está ativado para o usuário
 */
export function isAlertCategoryEnabled(
  userId: string,
  category: 'pendencias' | 'notas' | 'tarefas' | 'followup' | 'boletos' | 'metas' | 'chat' | 'estoque'
): boolean {
  const prefs = getUserNotificationPreferences(userId);
  return prefs.alerts[category] ?? true;
}

/**
 * Utilitário de deduplicação periódica de marcos de meta.
 * Cada percentual deve disparar a notificação somente UMA VEZ no período correspondente.
 */
export function checkAndRegisterMetaAlert(
  userId: string,
  period: 'diaria' | 'semanal' | 'mensal',
  milestone: 50 | 75 | 100
): boolean {
  if (typeof window === 'undefined') return false;

  const prefs = getUserNotificationPreferences(userId);
  if (!prefs.alerts.metas) return false;

  const pctKey = `pct${milestone}` as 'pct50' | 'pct75' | 'pct100';
  if (!prefs.metaAlerts[period][pctKey]) return false;

  const now = new Date();
  let periodKey = '';

  if (period === 'diaria') {
    // Ex: 2026-09-18
    periodKey = now.toISOString().slice(0, 10);
  } else if (period === 'semanal') {
    // Ano + semana do ano
    const oneJan = new Date(now.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((now.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7);
    periodKey = `${now.getFullYear()}_W${weekNum}`;
  } else {
    // Ex: 2026-09
    periodKey = `${now.getFullYear()}_M${now.getMonth() + 1}`;
  }

  const storageKey = `${DEDUPLICATION_PREFIX}${userId}_${period}_${periodKey}_${milestone}`;
  const alreadyFired = localStorage.getItem(storageKey);

  if (alreadyFired) {
    return false; // Já disparou neste período
  }

  // Marca como disparado
  try {
    localStorage.setItem(storageKey, new Date().toISOString());
  } catch {}

  return true; // Pode disparar a notificação
}
