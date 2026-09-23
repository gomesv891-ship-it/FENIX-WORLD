import { getStoredAccounts, getCurrentAuthUser } from './auth';
import { saveWholeCollectionToSupabase } from './supabaseClient';
import {
  getUserNotificationPreferences,
  playUserCustomSoundForCategory,
  NotificationCategoryType,
} from './userNotificationPreferences';
import { playNotificationSound } from './soundAlerts';

export { playUserCustomSoundForCategory };
export type { NotificationCategoryType };

export type NotificationCategory =
  | 'Tarefas'
  | 'Boletos'
  | 'Follow-up'
  | 'Meta'
  | 'Notas'
  | 'Pendências'
  | 'Pós-Vendas'
  | 'Estoque'
  | 'Chat';

export interface SystemNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  description: string;
  time: string;
  unread: boolean;
  targetTab: string;
  recipientId?: string;
  recipientName?: string;
  authorId?: string;
  authorName?: string;
  createdAt?: string;
  metadata?: Record<string, any>;
}

const STORAGE_KEY = 'fenix_header_notifications_v2';

// Base initial broadcast notifications (shown if no prior storage exists)
const INITIAL_SYSTEM_NOTIFICATIONS: SystemNotification[] = [
  {
    id: 'notif_met_1',
    category: 'Meta',
    title: 'Você bateu a meta hoje! 🎉',
    description: 'Parabéns! O faturamento diário atingiu o objetivo estipulado para hoje com novos fechamentos.',
    time: 'Hoje às 11:20',
    unread: true,
    targetTab: 'Metas',
    createdAt: '2026-09-09T11:20:00.000Z',
  },
  {
    id: 'notif_bol_1',
    category: 'Boletos',
    title: 'Boleto Vencendo Hoje (#BOL-2026-884)',
    description: 'Boleto de R$ 14.850,00 da Construtora Horizonte vence hoje. Enviar lembrete para faturamento.',
    time: 'Hoje às 08:30',
    unread: true,
    targetTab: 'Boletos',
    createdAt: '2026-09-09T08:30:00.000Z',
  },
  {
    id: 'notif_fup_1',
    category: 'Follow-up',
    title: 'Follow-up Pendente (48h sem retorno)',
    description: 'Retorno com Arquiteto Marcelo Duarte sobre proposta de SPC 5mm aguardando resposta.',
    time: 'Hoje às 10:15',
    unread: true,
    targetTab: 'Follow-up',
    createdAt: '2026-09-09T10:15:00.000Z',
  },
  {
    id: 'notif_tar_1',
    category: 'Tarefas',
    title: '3 Tarefas Agendadas para Hoje',
    description: 'Visita técnica no Edifício Splendor às 14h e envio de amostras LVT para Arq. Camila.',
    time: 'Hoje às 09:00',
    unread: true,
    targetTab: 'Tarefas',
    createdAt: '2026-09-09T09:00:00.000Z',
  },
];

/**
 * Normaliza e localiza a conta do usuário pelo ID ou Nome
 */
function resolveUser(identifier: string | { id?: string; name?: string } | null | undefined) {
  if (!identifier) return null;
  const rawStr = typeof identifier === 'string' ? identifier : (identifier.name || identifier.id || '');
  if (!rawStr || typeof rawStr !== 'string') return null;

  const accounts = getStoredAccounts();
  const idLower = rawStr.trim().toLowerCase();

  // 1. Busca por nome exato
  if (accounts[rawStr]) return accounts[rawStr];

  // 2. Busca por ID
  const byId = Object.values(accounts).find((u) => u.id === rawStr || (typeof identifier === 'object' && identifier.id && u.id === identifier.id));
  if (byId) return byId;

  // 3. Busca por similaridade no nome (Eder, Vanessa, Jessica/Jhessica)
  const byName = Object.values(accounts).find((u) => {
    const n = u.name.toLowerCase();
    if (n === idLower) return true;
    if (idLower.includes('eder') && n.includes('eder')) return true;
    if (idLower.includes('vanessa') && n.includes('vanessa')) return true;
    if (
      (idLower.includes('jhessica') || idLower.includes('jessica')) &&
      (n.includes('jhessica') || n.includes('jessica'))
    ) {
      return true;
    }
    return false;
  });

  return byName || null;
}

/**
 * Lê todas as notificações salvas no LocalStorage
 */
export function getAllStoredNotifications(): SystemNotification[] {
  if (typeof window === 'undefined') return INITIAL_SYSTEM_NOTIFICATIONS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Erro ao ler notificações do storage:', err);
  }
  return INITIAL_SYSTEM_NOTIFICATIONS;
}

/**
 * Salva a lista completa no storage e notifica o aplicativo
 */
function saveAllNotifications(list: SystemNotification[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event('fenix_notifications_updated'));
    window.dispatchEvent(new Event('storage'));
    saveWholeCollectionToSupabase(STORAGE_KEY, list).catch((err) => {
      console.warn('Erro ao sincronizar notificações com Supabase:', err);
    });
  } catch (err) {
    console.error('Erro ao persistir notificações:', err);
  }
}

/**
 * Envia uma notificação direcionada especificamente para um usuário.
 * Identifica o destinatário de forma consistente por ID e Nome Canônico.
 */
export function sendUserNotification(params: {
  id?: string;
  category: NotificationCategory;
  title: string;
  description: string;
  targetTab: string;
  recipientName?: string;
  recipientId?: string;
  authorName?: string;
  authorId?: string;
  metadata?: Record<string, any>;
}): SystemNotification {
  const targetUser = (params.recipientId || params.recipientName)
    ? resolveUser(params.recipientId || params.recipientName || '')
    : null;
  const authorUser = params.authorName ? resolveUser(params.authorName) : null;

  const resolvedRecipientName = targetUser ? targetUser.name : (params.recipientName?.trim() || 'Todos');
  const resolvedRecipientId = targetUser ? targetUser.id : params.recipientId;

  const now = new Date();
  const horaStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const newNotification: SystemNotification = {
    id: params.id || `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    category: params.category,
    title: params.title,
    description: params.description,
    time: `Hoje às ${horaStr}`,
    unread: true,
    targetTab: params.targetTab,
    recipientId: resolvedRecipientId,
    recipientName: resolvedRecipientName,
    authorId: authorUser ? authorUser.id : params.authorId,
    authorName: authorUser ? authorUser.name : params.authorName,
    createdAt: now.toISOString(),
    metadata: params.metadata,
  };

  const currentList = getAllStoredNotifications().filter((n) => n.id !== newNotification.id);
  const updatedList = [newNotification, ...currentList];
  saveAllNotifications(updatedList);

  // Broadcast entre abas / sessões ativas
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('fenix_new_assignment_notification', { detail: newNotification })
      );
    }
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('fenix_notifications_channel');
      bc.postMessage({ type: 'NEW_NOTIFICATION', notification: newNotification });
      bc.close();
    }
  } catch {}

  // Toca o som no momento do envio APENAS se o usuário que executou a ação for o próprio destinatário
  // Se for uma atribuição para OUTRO usuário, o som tocará em tempo real no login do destinatário
  try {
    const currentUserName = getCurrentAuthUser();
    // Não toca som no envio se o próprio autor da ação for quem disparou broadcast geral
    const isSelfAuthor = newNotification.authorName && currentUserName &&
      (newNotification.authorName.trim().toLowerCase() === currentUserName.trim().toLowerCase());

    if (!isSelfAuthor && isNotificationDirectedToUser(newNotification, currentUserName)) {
      const categoryKeyMap: Record<NotificationCategory, NotificationCategoryType> = {
        'Tarefas': 'tarefas',
        'Boletos': 'boletos',
        'Follow-up': 'followup',
        'Meta': 'metas',
        'Notas': 'notas',
        'Pendências': 'pendencias',
        'Pós-Vendas': 'followup',
        'Estoque': 'estoque',
        'Chat': 'chat',
      };
      const catType = categoryKeyMap[newNotification.category] || 'outras';
      playUserCustomSoundForCategory(currentUserName, catType);
    }
  } catch (audioErr) {
    console.warn('Aviso: Não foi possível reproduzir som de notificação:', audioErr);
  }

  return newNotification;
}

/**
 * Verifica se uma notificação é direcionada para um determinado usuário (por ID ou Nome)
 */
export function isNotificationDirectedToUser(
  notif: SystemNotification,
  userNameOrId: string | { id?: string; name?: string }
): boolean {
  if (!userNameOrId) return true;

  const user = resolveUser(userNameOrId);
  const targetId = user?.id || (typeof userNameOrId === 'object' ? userNameOrId.id : undefined);
  const targetName = (user?.name || (typeof userNameOrId === 'string' ? userNameOrId : userNameOrId?.name || '')).trim().toLowerCase();

  // Se for notificação de Chat enviada pelo próprio usuário, não deve notificar o autor
  if (notif.category === 'Chat' && notif.authorName) {
    const authorNorm = notif.authorName.trim().toLowerCase();
    if (
      authorNorm === targetName ||
      (targetName.includes('eder') && authorNorm.includes('eder')) ||
      (targetName.includes('vanessa') && authorNorm.includes('vanessa')) ||
      (targetName.includes('jhessica') && authorNorm.includes('jhessica')) ||
      (targetName.includes('jeferson') && authorNorm.includes('jeferson'))
    ) {
      return false;
    }
  }

  // 1. Se tem ID de destinatário específico
  if (notif.recipientId && targetId) {
    return notif.recipientId === targetId;
  }

  // 2. Se tem Nome de destinatário específico
  if (notif.recipientName && notif.recipientName !== 'Todos' && notif.recipientName !== 'Geral') {
    const rec = notif.recipientName.trim().toLowerCase();
    if (rec === targetName) return true;
    if (rec.includes(targetName) || targetName.includes(rec)) return true;
    if (targetName.includes('eder') && rec.includes('eder')) return true;
    if (targetName.includes('vanessa') && rec.includes('vanessa')) return true;
    if (
      (targetName.includes('jhessica') || targetName.includes('jessica')) &&
      (rec.includes('jhessica') || rec.includes('jessica'))
    ) {
      return true;
    }
    if (targetName.includes('lucilene') && rec.includes('lucilene')) return true;
    if (targetName.includes('fernando') && rec.includes('fernando')) return true;
    return false;
  }

  // 3. Notificações broadcast ou legadas do sistema geral (sem destinatário único ou destinadas a 'Todos')
  return true;
}

/**
 * Retorna somente as notificações destinadas ao usuário logado ou gerais da empresa
 */
export function getUserNotifications(userNameOrId: string): SystemNotification[] {
  const all = getAllStoredNotifications();
  if (!userNameOrId) return all;
  return all.filter((notif) => isNotificationDirectedToUser(notif, userNameOrId));
}

/**
 * Marca notificações que atendem a uma condição como lidas (ex: tarefa concluída, chat lido)
 */
export function markNotificationsAsReadByCondition(predicate: (n: SystemNotification) => boolean): void {
  const current = getAllStoredNotifications();
  let changed = false;
  const updated = current.map((n) => {
    if (n.unread && predicate(n)) {
      changed = true;
      return { ...n, unread: false };
    }
    return n;
  });
  if (changed) {
    saveAllNotifications(updated);
  }
}

/**
 * Marca uma notificação específica como lida
 */
export function markNotificationAsRead(id: string): void {
  const current = getAllStoredNotifications();
  const updated = current.map((n) => (n.id === id ? { ...n, unread: false } : n));
  saveAllNotifications(updated);
}

/**
 * Marca todas as notificações do usuário logado como lidas
 */
export function markAllNotificationsAsReadForUser(userNameOrId: string): void {
  const user = resolveUser(userNameOrId);
  const targetId = user?.id;
  const targetName = (user?.name || userNameOrId).trim().toLowerCase();

  const current = getAllStoredNotifications();
  const updated = current.map((n) => {
    const isTarget =
      (n.recipientId && targetId && n.recipientId === targetId) ||
      (n.recipientName && (
        n.recipientName.toLowerCase() === targetName ||
        (targetName.includes('eder') && n.recipientName.toLowerCase().includes('eder')) ||
        (targetName.includes('vanessa') && n.recipientName.toLowerCase().includes('vanessa')) ||
        ((targetName.includes('jhessica') || targetName.includes('jessica')) &&
          (n.recipientName.toLowerCase().includes('jhessica') || n.recipientName.toLowerCase().includes('jessica')))
      )) ||
      (!n.recipientId && !n.recipientName);

    if (isTarget) {
      return { ...n, unread: false };
    }
    return n;
  });

  saveAllNotifications(updated);
}

/**
 * Remove uma notificação específica
 */
export function deleteNotification(id: string): void {
  const current = getAllStoredNotifications();
  const updated = current.filter((n) => n.id !== id);
  saveAllNotifications(updated);
}

/**
 * Remove múltiplas notificações em massa
 */
export function deleteNotifications(ids: string[]): void {
  if (!ids || ids.length === 0) return;
  const idSet = new Set(ids);
  const current = getAllStoredNotifications();
  const updated = current.filter((n) => !idSet.has(n.id));
  saveAllNotifications(updated);
}

/**
 * Marca múltiplas notificações como lidas em massa
 */
export function markNotificationsAsRead(ids: string[]): void {
  if (!ids || ids.length === 0) return;
  const idSet = new Set(ids);
  const current = getAllStoredNotifications();
  const updated = current.map((n) => (idSet.has(n.id) ? { ...n, unread: false } : n));
  saveAllNotifications(updated);
}

/**
 * Alterna status de leitura (lida / não lida) de uma notificação
 */
export function toggleNotificationRead(id: string): void {
  const current = getAllStoredNotifications();
  const updated = current.map((n) => (n.id === id ? { ...n, unread: !n.unread } : n));
  saveAllNotifications(updated);
}

/**
 * Limpa todas as notificações já lidas do usuário
 */
export function clearAllReadNotificationsForUser(userNameOrId: string): void {
  const user = resolveUser(userNameOrId);
  const targetId = user?.id;
  const targetName = (user?.name || userNameOrId).trim().toLowerCase();

  const current = getAllStoredNotifications();
  const updated = current.filter((n) => {
    const isUserNotif =
      (n.recipientId && targetId && n.recipientId === targetId) ||
      (n.recipientName && n.recipientName.toLowerCase() === targetName) ||
      (!n.recipientId && !n.recipientName);

    // Se for do usuário e estiver lida, remove
    if (isUserNotif && !n.unread) {
      return false;
    }
    return true;
  });

  saveAllNotifications(updated);
}
