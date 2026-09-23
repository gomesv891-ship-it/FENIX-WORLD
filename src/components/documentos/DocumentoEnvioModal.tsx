import React, { useState, useEffect } from 'react';
import {
  X,
  Send,
  MessageCircle,
  Mail,
  User,
  Phone,
  FileText,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { DocumentoItem, ClientRecord } from '../../types';
import { registerDocumentoEnvio } from '../../utils/documentosService';

interface DocumentoEnvioModalProps {
  isOpen: boolean;
  documento: DocumentoItem | null;
  clients: ClientRecord[];
  currentUserName: string;
  onClose: () => void;
  onEnvioSuccess?: (tipo: string, destinatario: string) => void;
}

export const DocumentoEnvioModal: React.FC<DocumentoEnvioModalProps> = ({
  isOpen,
  documento,
  clients,
  currentUserName,
  onClose,
  onEnvioSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'email'>('whatsapp');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clienteNome, setClienteNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [pedido, setPedido] = useState('');
  const [assunto, setAssunto] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (documento) {
      setAssunto(`Fênix World - ${documento.titulo}`);
      setPedido(documento.pedidoVinculado || '');

      // Se já houver cliente vinculado
      if (documento.clienteVinculadoId) {
        setSelectedClientId(documento.clienteVinculadoId);
        const cl = clients.find((c) => c.id === documento.clienteVinculadoId);
        if (cl) {
          setClienteNome(cl.name);
          setTelefone(cl.whatsapp || cl.phone || '');
          setEmail(cl.email || '');
        }
      } else {
        setClienteNome(documento.clienteNome || '');
      }

      setMensagem(
        `Olá! Segue em anexo o documento "${documento.titulo}" emitido pela Fênix World Distribuidora.\n\nQualquer dúvida, estamos à inteira disposição.`
      );
    }
    setStatusMsg(null);
  }, [documento, clients, isOpen]);

  const handleSelectClient = (clientId: string) => {
    setSelectedClientId(clientId);
    const cl = clients.find((c) => c.id === clientId);
    if (cl) {
      setClienteNome(cl.name);
      setTelefone(cl.whatsapp || cl.phone || '');
      setEmail(cl.email || '');
      setMensagem(
        `Olá, ${cl.name}! Segue o documento "${documento?.titulo || 'Documento Fênix'}" emitido especialmente para você pela Fênix World Distribuidora.\n\nFicamos à disposição!`
      );
    }
  };

  if (!isOpen || !documento) return null;

  const handleSendWhatsApp = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = telefone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 8) {
      setStatusMsg({ type: 'error', text: 'Por favor, informe um número de WhatsApp válido com DDD.' });
      return;
    }

    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const encodedText = encodeURIComponent(mensagem);
    const waUrl = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodedText}`;

    // Registra no histórico de envios
    registerDocumentoEnvio(
      {
        documentoId: documento.id,
        documentoTitulo: documento.titulo,
        clienteNome: clienteNome || 'Cliente Avulso',
        clienteId: selectedClientId || undefined,
        pedido: pedido || undefined,
        tipoEnvio: 'WhatsApp',
        destinatario: fullPhone,
        mensagem,
        status: 'Enviado',
      },
      currentUserName
    );

    // Abre o WhatsApp Web ou App
    window.open(waUrl, '_blank');

    setStatusMsg({
      type: 'success',
      text: 'Envio registrado com sucesso! A janela do WhatsApp foi iniciada.',
    });

    if (onEnvioSuccess) {
      onEnvioSuccess('WhatsApp', fullPhone);
    }

    setTimeout(() => {
      onClose();
    }, 1200);
  };

  const handleSendEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setStatusMsg({ type: 'error', text: 'Por favor, informe um e-mail válido para envio.' });
      return;
    }

    const mailtoUrl = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
      assunto
    )}&body=${encodeURIComponent(mensagem)}`;

    // Registra no histórico de envios
    registerDocumentoEnvio(
      {
        documentoId: documento.id,
        documentoTitulo: documento.titulo,
        clienteNome: clienteNome || 'Cliente Avulso',
        clienteId: selectedClientId || undefined,
        pedido: pedido || undefined,
        tipoEnvio: 'E-mail',
        destinatario: email,
        assunto,
        mensagem,
        status: 'Enviado',
      },
      currentUserName
    );

    window.open(mailtoUrl, '_blank');

    setStatusMsg({
      type: 'success',
      text: 'Envio registrado com sucesso! Seu cliente de e-mail foi aberto.',
    });

    if (onEnvioSuccess) {
      onEnvioSuccess('E-mail', email);
    }

    setTimeout(() => {
      onClose();
    }, 1200);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#0f172a] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#091122]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0055ff]/20 text-[#0055ff] flex items-center justify-center">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Enviar Documento
              </h2>
              <p className="text-xs text-slate-400 truncate max-w-xs">
                {documento.titulo}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-800 bg-[#0b1329] px-6 pt-3">
          <button
            type="button"
            onClick={() => setActiveTab('whatsapp')}
            className={`pb-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'whatsapp'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            WhatsApp
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('email')}
            className={`pb-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'email'
                ? 'border-[#0055ff] text-[#0055ff]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mail className="w-4 h-4" />
            E-mail
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {statusMsg && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/10 border border-red-500/30 text-red-300'
              }`}
            >
              {statusMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              )}
              <span>{statusMsg.text}</span>
            </div>
          )}

          {/* CRM Client Quick Select */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              Vincular Cliente do CRM
            </label>
            <select
              value={selectedClientId}
              onChange={(e) => handleSelectClient(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#1e293b]/70 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-[#0055ff] transition-all"
            >
              <option value="">Selecione um cliente (ou preencha avulso abaixo)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.document ? `(${c.document})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Nome do Cliente
              </label>
              <input
                type="text"
                value={clienteNome}
                onChange={(e) => setClienteNome(e.target.value)}
                placeholder="Ex: Construtora Alfa"
                className="w-full px-3.5 py-2 bg-[#1e293b]/70 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-[#0055ff]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Pedido / Orçamento
              </label>
              <input
                type="text"
                value={pedido}
                onChange={(e) => setPedido(e.target.value)}
                placeholder="Ex: #2620"
                className="w-full px-3.5 py-2 bg-[#1e293b]/70 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-[#0055ff]"
              />
            </div>
          </div>

          {activeTab === 'whatsapp' ? (
            <form id="envio-form" onSubmit={handleSendWhatsApp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-400" />
                  Número do WhatsApp <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="Ex: (11) 98765-4321"
                  className="w-full px-3.5 py-2.5 bg-[#1e293b]/70 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 transition-all"
                  required
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Informe o DDD + número com 9 dígitos.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Mensagem WhatsApp
                </label>
                <textarea
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  rows={4}
                  className="w-full px-3.5 py-2.5 bg-[#1e293b]/70 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500 transition-all resize-none"
                  required
                />
              </div>

              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3">
                <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="text-xs">
                  <p className="font-semibold text-emerald-300">Documento pronto para envio</p>
                  <p className="text-slate-400">
                    O envio será gravado no Histórico de Envios com data, hora e usuário responsável.
                  </p>
                </div>
              </div>
            </form>
          ) : (
            <form id="envio-form" onSubmit={handleSendEmail} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-[#0055ff]" />
                  E-mail do Destinatário <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Ex: cliente@empresa.com.br"
                  className="w-full px-3.5 py-2.5 bg-[#1e293b]/70 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-[#0055ff] transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Assunto do E-mail
                </label>
                <input
                  type="text"
                  value={assunto}
                  onChange={(e) => setAssunto(e.target.value)}
                  className="w-full px-3.5 py-2 bg-[#1e293b]/70 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-[#0055ff] transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Mensagem do E-mail
                </label>
                <textarea
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  rows={4}
                  className="w-full px-3.5 py-2.5 bg-[#1e293b]/70 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-[#0055ff] transition-all resize-none"
                  required
                />
              </div>

              <div className="p-3 bg-[#0055ff]/10 border border-[#0055ff]/20 rounded-xl flex items-center gap-3">
                <FileText className="w-5 h-5 text-[#0055ff] shrink-0" />
                <div className="text-xs">
                  <p className="font-semibold text-blue-300">Anexo do Documento</p>
                  <p className="text-slate-400">
                    O PDF do documento é associado e o histórico de envio é salvo automaticamente.
                  </p>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#091122] border-t border-slate-800 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
          >
            Cancelar
          </button>

          {activeTab === 'whatsapp' ? (
            <button
              type="submit"
              form="envio-form"
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
            >
              <MessageCircle className="w-4 h-4" />
              Abrir WhatsApp e Registrar
            </button>
          ) : (
            <button
              type="submit"
              form="envio-form"
              className="px-5 py-2 text-xs font-bold text-white bg-[#0055ff] hover:bg-[#0044cc] rounded-xl shadow-lg shadow-[#0055ff]/20 transition-all flex items-center gap-2"
            >
              <Mail className="w-4 h-4" />
              Enviar E-mail e Registrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
