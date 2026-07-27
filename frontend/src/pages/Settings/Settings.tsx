import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { usersApi, UserProfile } from '../../api/users.api';
import { b2bLegalDocuments } from '../../data/b2bLegal';
import { useAuthStore } from '../../store/auth.store';
import s from './Settings.module.css';

const SYSTEM_AVATAR_COLORS = ['#7c6cfc', '#d4a847', '#2980b9', '#16a085', '#8e44ad', '#c65d3b'];

function getInitials(name: string | null, email: string): string {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length > 0) {
    return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  }
  return email.slice(0, 1).toUpperCase() || 'П';
}

function automaticAvatarColor(profile: UserProfile | null, email: string): string {
  if (profile?.avatarColor) return profile.avatarColor;
  const hash = Array.from(profile?.id ?? email).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return SYSTEM_AVATAR_COLORS[hash % SYSTEM_AVATAR_COLORS.length];
}

function requestError(error: unknown, fallback: string): string {
  return (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}

interface ProfileDialogProps {
  title: string;
  labelledBy: string;
  children: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
}

function ProfileDialog({ title, labelledBy, children, onClose, closeDisabled = false }: ProfileDialogProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabled) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeDisabled, onClose]);

  return (
    <div
      className={s.modalOverlay}
      role="presentation"
      onMouseDown={() => {
        if (!closeDisabled) onClose();
      }}
    >
      <section
        className={s.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className={s.modalTitle} id={labelledBy}>{title}</h2>
        {children}
      </section>
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const authUser = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const refreshUser = useAuthStore((state) => state.refreshUser);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [nameTouched, setNameTouched] = useState(false);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatedPassword, setRepeatedPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const currentPasswordRef = useRef<HTMLInputElement>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const deleteInputRef = useRef<HTMLInputElement>(null);
  const [logoutLoading, setLogoutLoading] = useState(false);

  useEffect(() => {
    document.title = 'Мой профиль — Luma IQ';
  }, []);

  useEffect(() => {
    let cancelled = false;
    setProfileLoading(true);
    usersApi.getMe()
      .then((user) => {
        if (cancelled) return;
        const nextName = user.name ?? '';
        setProfile(user);
        setName(nextName);
        setSavedName(nextName.trim());
        setProfileError('');
      })
      .catch(() => {
        if (cancelled) return;
        const fallbackName = authUser?.name ?? '';
        setName(fallbackName);
        setSavedName(fallbackName.trim());
        setProfileError('Не удалось загрузить данные профиля. Обновите страницу.');
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authUser?.id, authUser?.name]);

  useEffect(() => {
    if (passwordOpen) {
      window.setTimeout(() => currentPasswordRef.current?.focus(), 0);
    }
  }, [passwordOpen]);

  useEffect(() => {
    if (deleteOpen) {
      window.setTimeout(() => deleteInputRef.current?.focus(), 0);
    }
  }, [deleteOpen]);

  const displayEmail = profile?.email ?? authUser?.email ?? '';
  const normalizedName = name.trim();
  const nameInvalid = nameTouched && normalizedName.length === 0;
  const nameChanged = normalizedName !== savedName;
  const canSaveProfile = !profileLoading && !profileSaving && normalizedName.length > 0 && nameChanged;
  const initials = getInitials(normalizedName || null, displayEmail);
  const avatarColor = useMemo(
    () => automaticAvatarColor(profile, displayEmail),
    [displayEmail, profile],
  );

  async function handleSaveProfile(event: FormEvent) {
    event.preventDefault();
    setNameTouched(true);
    if (!normalizedName || !nameChanged || profileSaving) return;

    setProfileSaving(true);
    setProfileError('');
    try {
      const updated = await usersApi.updateMe({ name: normalizedName });
      setProfile(updated);
      setName(updated.name ?? '');
      setSavedName(updated.name?.trim() ?? '');
      await refreshUser();
      toast.success('Имя сохранено');
    } catch (error) {
      const message = requestError(error, 'Не удалось сохранить имя');
      setProfileError(message);
      toast.error(message);
    } finally {
      setProfileSaving(false);
    }
  }

  function closePasswordDialog() {
    if (passwordSaving) return;
    setPasswordOpen(false);
    setCurrentPassword('');
    setNewPassword('');
    setRepeatedPassword('');
    setPasswordError('');
  }

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError('');
    if (!currentPassword) {
      setPasswordError('Введите текущий пароль');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('Новый пароль должен содержать минимум 8 символов');
      return;
    }
    if (newPassword !== repeatedPassword) {
      setPasswordError('Новый пароль и повтор не совпадают');
      return;
    }

    setPasswordSaving(true);
    try {
      await usersApi.changePassword(currentPassword, newPassword);
      setPasswordOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setRepeatedPassword('');
      setPasswordError('');
      toast.success('Пароль изменён');
    } catch (error) {
      setPasswordError(requestError(error, 'Не удалось изменить пароль'));
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleLogout() {
    if (logoutLoading) return;
    setLogoutLoading(true);
    try {
      await logout();
      navigate('/auth', { replace: true });
    } finally {
      setLogoutLoading(false);
    }
  }

  function closeDeleteDialog() {
    if (deleteLoading) return;
    setDeleteOpen(false);
    setDeleteConfirmation('');
    setDeleteError('');
  }

  async function handleDeleteAccount() {
    if (deleteConfirmation !== 'УДАЛИТЬ' || deleteLoading) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await usersApi.deleteMe();
      await logout();
      navigate('/auth', { replace: true });
      toast.success('Аккаунт удалён');
    } catch (error) {
      setDeleteError(requestError(error, 'Не удалось удалить аккаунт'));
      setDeleteLoading(false);
    }
  }

  return (
    <div className={s.root}>
      <header className={s.header}>
        <h1 className={s.title}>Мой профиль</h1>
      </header>

      <div className={s.sections}>
        <section className={s.section} id="profile">
          <h2 className={s.sectionTitle}>Личные данные</h2>
          <div className={s.personalLayout}>
            <div className={s.avatar} style={{ backgroundColor: avatarColor }} aria-hidden="true">
              {initials}
            </div>
            <form className={s.profileForm} onSubmit={(event) => void handleSaveProfile(event)}>
              <div className={s.field}>
                <label className={s.label} htmlFor="profile-name">Имя</label>
                <input
                  className={`${s.input}${nameInvalid ? ` ${s.inputError}` : ''}`}
                  id="profile-name"
                  type="text"
                  value={name}
                  disabled={profileLoading}
                  maxLength={100}
                  autoComplete="name"
                  onBlur={() => setNameTouched(true)}
                  onChange={(event) => {
                    setName(event.target.value);
                    setProfileError('');
                  }}
                  placeholder="Ваше имя"
                />
                {nameInvalid && <p className={s.fieldError}>Имя не может быть пустым</p>}
              </div>

              <div className={s.field}>
                <span className={s.label}>Email</span>
                <div className={s.readOnlyField} aria-label={`Email: ${displayEmail}`}>
                  {displayEmail || 'Загружаем...'}
                </div>
              </div>

              {profileError && <p className={s.formError} role="alert">{profileError}</p>}
              <button className={s.primaryButton} type="submit" disabled={!canSaveProfile}>
                <span>{profileSaving ? 'Сохраняем...' : 'Сохранить изменения'}</span>
              </button>
            </form>
          </div>
        </section>

        <section className={s.section}>
          <h2 className={s.sectionTitle}>Безопасность</h2>
          <div className={s.settingRow}>
            <div>
              <div className={s.settingLabel}>Пароль</div>
              <div className={s.passwordMask} aria-label="Пароль установлен">••••••••••</div>
            </div>
            <button className={s.secondaryButton} type="button" onClick={() => setPasswordOpen(true)}>
              Изменить пароль
            </button>
          </div>
        </section>

        <section className={s.section}>
          <h2 className={s.sectionTitle}>Управление аккаунтом</h2>
          <div className={s.settingRow}>
            <div>
              <div className={s.settingLabel}>Выход</div>
              <p className={s.settingDescription}>Завершить текущую сессию на этом устройстве.</p>
            </div>
            <button
              className={s.secondaryButton}
              type="button"
              disabled={logoutLoading}
              onClick={() => void handleLogout()}
            >
              {logoutLoading ? 'Выходим...' : 'Выйти из аккаунта'}
            </button>
          </div>

          <div className={s.accountDivider} />

          <div className={s.deleteSection}>
            <div>
              <h3 className={s.deleteTitle}>Удалить аккаунт</h3>
              <p className={s.settingDescription}>
                Аккаунт, проекты и связанные с ними данные станут недоступны. Для удаления потребуется дополнительное подтверждение.
              </p>
            </div>
            <button className={s.deleteOutlineButton} type="button" onClick={() => setDeleteOpen(true)}>
              Удалить аккаунт
            </button>
          </div>
        </section>
      </div>

      <footer className={s.legalFooter}>
        <nav className={s.legalLinks} aria-label="Юридические документы">
          {b2bLegalDocuments.map((document) => (
            <Link key={document.path} to={document.path}>{document.title}</Link>
          ))}
        </nav>
        <p>© 2026 Luma IQ</p>
        <p>Давидюк Леонид Дмитриевич · ИНН 402914848246</p>
      </footer>

      {passwordOpen && (
        <ProfileDialog
          title="Изменить пароль"
          labelledBy="change-password-title"
          onClose={closePasswordDialog}
          closeDisabled={passwordSaving}
        >
          <form className={s.modalForm} onSubmit={(event) => void handleChangePassword(event)}>
            <div className={s.field}>
              <label className={s.label} htmlFor="current-password">Текущий пароль</label>
              <input
                ref={currentPasswordRef}
                className={s.input}
                id="current-password"
                type="password"
                value={currentPassword}
                autoComplete="current-password"
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                  setPasswordError('');
                }}
              />
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="new-password">Новый пароль</label>
              <input
                className={s.input}
                id="new-password"
                type="password"
                value={newPassword}
                autoComplete="new-password"
                aria-describedby="new-password-hint"
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  setPasswordError('');
                }}
              />
              <p className={s.fieldHint} id="new-password-hint">Минимум 8 символов</p>
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="repeat-password">Повторите новый пароль</label>
              <input
                className={s.input}
                id="repeat-password"
                type="password"
                value={repeatedPassword}
                autoComplete="new-password"
                onChange={(event) => {
                  setRepeatedPassword(event.target.value);
                  setPasswordError('');
                }}
              />
            </div>
            {passwordError && <p className={s.formError} role="alert">{passwordError}</p>}
            <div className={s.modalActions}>
              <button className={s.secondaryButton} type="button" onClick={closePasswordDialog} disabled={passwordSaving}>
                Отмена
              </button>
              <button
                className={s.primaryButton}
                type="submit"
                disabled={passwordSaving || !currentPassword || newPassword.length < 8 || newPassword !== repeatedPassword}
              >
                <span>{passwordSaving ? 'Сохраняем...' : 'Сохранить новый пароль'}</span>
              </button>
            </div>
          </form>
        </ProfileDialog>
      )}

      {deleteOpen && (
        <ProfileDialog
          title="Удалить аккаунт?"
          labelledBy="delete-account-title"
          onClose={closeDeleteDialog}
          closeDisabled={deleteLoading}
        >
          <p className={s.modalDescription}>
            После удаления вы потеряете доступ к проектам и созданным материалам. Это действие нельзя отменить через интерфейс.
          </p>
          <div className={s.field}>
            <label className={s.label} htmlFor="delete-confirmation">
              Введите слово <strong>УДАЛИТЬ</strong>
            </label>
            <input
              ref={deleteInputRef}
              className={s.input}
              id="delete-confirmation"
              type="text"
              value={deleteConfirmation}
              autoComplete="off"
              onChange={(event) => {
                setDeleteConfirmation(event.target.value);
                setDeleteError('');
              }}
            />
          </div>
          {deleteError && <p className={s.formError} role="alert">{deleteError}</p>}
          <div className={s.modalActions}>
            <button className={s.secondaryButton} type="button" onClick={closeDeleteDialog} disabled={deleteLoading}>
              Отмена
            </button>
            <button
              className={s.deleteButton}
              type="button"
              disabled={deleteLoading || deleteConfirmation !== 'УДАЛИТЬ'}
              onClick={() => void handleDeleteAccount()}
            >
              {deleteLoading ? 'Удаляем...' : 'Удалить аккаунт'}
            </button>
          </div>
        </ProfileDialog>
      )}
    </div>
  );
}
