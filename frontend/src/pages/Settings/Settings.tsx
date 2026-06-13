import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { usersApi, UserProfile } from '../../api/users.api';
import { useAuthStore } from '../../store/auth.store';
import s from './Settings.module.css';

const AVATAR_COLORS = [
  '#7c6cfc', '#e05c97', '#f5a623', '#27ae60',
  '#2980b9', '#8e44ad', '#e74c3c', '#16a085',
];

function getInitials(name: string | null, email: string): string {
  if (name) return name.trim().slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

export default function Settings() {
  const navigate = useNavigate();
  const { user: authUser, logout } = useAuthStore();

  const [profile, setProfile]                 = useState<UserProfile | null>(null);
  const [name, setName]                       = useState('');
  const [avatarColor, setAvatarColor]         = useState('#7c6cfc');
  const [aiModel, setAiModel]                 = useState('chatgpt');
  const [specialization, setSpecialization]   = useState('');
  const [profileSaving, setProfileSaving]     = useState(false);
  const [profileMsg, setProfileMsg]           = useState('');

  const [curPass, setCurPass]   = useState('');
  const [newPass, setNewPass]   = useState('');
  const [repPass, setRepPass]   = useState('');
  const [passMsg, setPassMsg]   = useState('');
  const [passSaving, setPassSaving] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    usersApi.getMe().then((u) => {
      setProfile(u);
      setName(u.name ?? '');
      setAvatarColor(u.avatarColor ?? '#7c6cfc');
      setAiModel(u.defaultAiModel ?? 'chatgpt');
      setSpecialization(u.specialization ?? '');
    }).catch(() => {
      if (authUser) {
        setName(authUser.name ?? '');
      }
    });
  }, []);

  async function handleSaveProfile() {
    setProfileSaving(true);
    setProfileMsg('');
    try {
      const updated = await usersApi.updateMe({ name, avatarColor, defaultAiModel: aiModel, specialization });
      setProfile(updated);
      setProfileMsg('Сохранено');
      setTimeout(() => setProfileMsg(''), 3000);
    } catch {
      setProfileMsg('Ошибка при сохранении');
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword() {
    setPassMsg('');
    if (newPass.length < 8) { setPassMsg('Пароль должен быть не менее 8 символов'); return; }
    if (newPass !== repPass) { setPassMsg('Пароли не совпадают'); return; }
    setPassSaving(true);
    try {
      await usersApi.changePassword(curPass, newPass);
      setCurPass(''); setNewPass(''); setRepPass('');
      setPassMsg('Пароль изменён');
      setTimeout(() => setPassMsg(''), 3000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setPassMsg(msg ?? 'Ошибка при смене пароля');
    } finally {
      setPassSaving(false);
    }
  }

  async function handleDeleteAccount() {
    try {
      await usersApi.deleteMe();
      await logout();
      navigate('/auth');
    } catch {
      toast.error('Ошибка при удалении аккаунта');
    }
  }

  const displayEmail = profile?.email ?? authUser?.email ?? '';
  const initials     = getInitials(name || null, displayEmail);

  return (
    <div className={s.root}>
      <div className={s.header}>
        <h2 className={s.title}>Настройки</h2>
      </div>

      <div className={s.sections}>

        {/* ── Профиль ─────────────────────────────────── */}
        <div className={s.section} id="profile">
          <h3 className={s.sectionTitle}>Профиль</h3>

          <div className={s.avatarRow}>
            <div className={s.avatar} style={{ background: avatarColor }}>
              {initials}
            </div>
            <div className={s.colorPicker}>
              <span className={s.colorLabel}>Цвет аватара</span>
              <div className={s.colors}>
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`${s.colorDot} ${avatarColor === c ? s.colorDotActive : ''}`}
                    style={{ background: c }}
                    onClick={() => setAvatarColor(c)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className={s.field}>
            <label className={s.label}>Имя</label>
            <input
              className={s.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ваше имя"
            />
          </div>
          <div className={s.field}>
            <label className={s.label}>Email</label>
            <input className={s.input} type="email" value={displayEmail} readOnly disabled />
          </div>
          <div className={s.field}>
            <label className={s.label}>Ваша специализация</label>
            <input
              className={s.input}
              type="text"
              value={specialization}
              onChange={(e) => setSpecialization(e.target.value)}
              placeholder="Например: психолог по тревоге, семейный психолог, коуч по выгоранию"
            />
            <span className={s.fieldHint}>Используется в конструкторе промптов стратегии</span>
          </div>

          <div className={s.saveLine}>
            <button className={s.saveBtn} onClick={() => void handleSaveProfile()} disabled={profileSaving}>
              {profileSaving ? 'Сохраняем...' : 'Сохранить изменения'}
            </button>
            {profileMsg && <span className={s.msg}>{profileMsg}</span>}
          </div>
        </div>

        {/* ── ИИ по умолчанию ─────────────────────────── */}
        <div className={s.section}>
          <h3 className={s.sectionTitle}>ИИ по умолчанию</h3>
          <div className={s.aiChips}>
            <button
              className={`${s.aiChip} ${aiModel === 'chatgpt' ? s.aiChipActive : ''}`}
              onClick={() => setAiModel('chatgpt')}
            >
              🤖 ChatGPT
            </button>
            <button
              className={`${s.aiChip} ${aiModel === 'claude' ? s.aiChipActive : ''}`}
              onClick={() => setAiModel('claude')}
            >
              🧠 Claude
            </button>
          </div>
          <div className={s.saveLine}>
            <button className={s.saveBtn} onClick={() => void handleSaveProfile()} disabled={profileSaving}>
              Сохранить
            </button>
          </div>
        </div>

        {/* ── Безопасность ────────────────────────────── */}
        <div className={s.section}>
          <h3 className={s.sectionTitle}>Безопасность</h3>
          <div className={s.field}>
            <label className={s.label}>Текущий пароль</label>
            <input className={s.input} type="password" value={curPass} onChange={(e) => setCurPass(e.target.value)} placeholder="••••••••" />
          </div>
          <div className={s.field}>
            <label className={s.label}>Новый пароль</label>
            <input className={s.input} type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Минимум 8 символов" />
          </div>
          <div className={s.field}>
            <label className={s.label}>Повторить пароль</label>
            <input className={s.input} type="password" value={repPass} onChange={(e) => setRepPass(e.target.value)} placeholder="••••••••" />
          </div>
          <div className={s.saveLine}>
            <button className={s.saveBtn} onClick={() => void handleChangePassword()} disabled={passSaving}>
              {passSaving ? 'Меняем...' : 'Изменить пароль'}
            </button>
            {passMsg && <span className={s.msg}>{passMsg}</span>}
          </div>
        </div>

        {/* ── Опасная зона ────────────────────────────── */}
        <div className={s.section}>
          <h3 className={s.sectionTitle}>Опасная зона</h3>
          <div className={s.dangerRow}>
            <button
              className={s.dangerOutlineBtn}
              onClick={() => void logout().then(() => navigate('/auth'))}
            >
              Выйти из аккаунта
            </button>
            {!deleteConfirm ? (
              <button className={s.dangerBtn} onClick={() => setDeleteConfirm(true)}>
                Удалить аккаунт
              </button>
            ) : (
              <div className={s.confirmRow}>
                <span className={s.confirmText}>Удалить безвозвратно?</span>
                <button className={s.dangerBtn} onClick={() => void handleDeleteAccount()}>Да, удалить</button>
                <button className={s.cancelBtn} onClick={() => setDeleteConfirm(false)}>Отмена</button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
