import { useEffect, useState } from 'react';
import type {
  AuthServerStatusPayload,
  LauncherAccountProfile,
  LauncherSettings,
  SidebarView,
} from '../shared/contracts';
import { GlyphIcon } from './icons';

interface AuthDialogProps {
  mode: Extract<SidebarView, 'login' | 'register' | 'profile'>;
  settings: LauncherSettings;
  authStatus: AuthServerStatusPayload | null;
  accountProfile: LauncherAccountProfile | null;
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, password: string, email?: string) => Promise<void>;
  onLogout: () => Promise<void>;
  onRefreshProfile: () => Promise<void>;
  onUpdateEmail: (email: string) => Promise<void>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  onRecoverPassword: (username: string) => Promise<string>;
  onClose: () => void;
}

interface CaptchaChallenge {
  question: string;
  answers: string[];
}

interface PasswordInputProps {
  id: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}

const CAPTCHA_CHALLENGES: CaptchaChallenge[] = [
  {
    question: 'Маг зажег 2 алые руны и 3 синие. Сколько рун горит?',
    answers: ['5', 'пять'],
  },
  {
    question: 'У хранителя было 4 ключа, один забрал рыцарь. Сколько осталось?',
    answers: ['3', 'три'],
  },
  {
    question: 'Введите слово древнего прохода: руна',
    answers: ['руна'],
  },
  {
    question: 'В башне 6 свечей, две погасли. Сколько свечей еще горит?',
    answers: ['4', 'четыре'],
  },
];

function pickCaptcha() {
  return CAPTCHA_CHALLENGES[Math.floor(Math.random() * CAPTCHA_CHALLENGES.length)] ?? CAPTCHA_CHALLENGES[0];
}

function normalizeAnswer(value: string) {
  return value.trim().toLocaleLowerCase('ru-RU').replaceAll('ё', 'е');
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function formatDateTime(value: string) {
  if (!value) {
    return 'нет данных';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'нет данных';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getReadableAuthError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();

  if (/fetch failed|failed to fetch|networkerror|econnrefused|econnreset|enotfound|etimedout/i.test(message)) {
    return 'Сервер авторизации сейчас недоступен. Попробуйте еще раз чуть позже.';
  }

  return message || fallback;
}

function PasswordInput({
  id,
  value,
  placeholder,
  onChange,
}: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="password-field">
      <input
        id={id}
        className="text-input"
        type={isVisible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setIsVisible((current) => !current)}
        aria-label={isVisible ? 'Скрыть пароль' : 'Показать пароль'}
      >
        <GlyphIcon name={isVisible ? 'eye-off' : 'eye'} />
      </button>
    </div>
  );
}

export function AuthDialog(props: AuthDialogProps) {
  const {
    mode,
    settings,
    authStatus,
    accountProfile,
    onLogin,
    onRegister,
    onLogout,
    onRefreshProfile,
    onUpdateEmail,
    onChangePassword,
    onRecoverPassword,
    onClose,
  } = props;

  const [username, setUsername] = useState(settings.username);
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [email, setEmail] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordRepeat, setNewPasswordRepeat] = useState('');
  const [captcha, setCaptcha] = useState<CaptchaChallenge>(() => pickCaptcha());
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isProfile = mode === 'profile';
  const isRegister = mode === 'register';
  const isOnline = authStatus?.online ?? true;

  useEffect(() => {
    setUsername(settings.username);
    setPassword('');
    setRepeatPassword('');
    setEmail('');
    setCaptcha(pickCaptcha());
    setCaptchaAnswer('');
    setError('');
    setNotice('');
  }, [mode, settings.username]);

  useEffect(() => {
    if (isProfile) {
      void onRefreshProfile().catch(() => undefined);
    }
  }, [isProfile, onRefreshProfile]);

  useEffect(() => {
    setProfileEmail(accountProfile?.email ?? '');
  }, [accountProfile?.email]);

  const submit = async () => {
    setError('');
    setNotice('');

    if (!isOnline) {
      setError('Нет подключения к интернету или сервер авторизации недоступен.');
      return;
    }

    if (!username.trim()) {
      setError('Укажите ник игрока.');
      return;
    }

    if (!password) {
      setError('Введите пароль.');
      return;
    }

    if (isRegister && password !== repeatPassword) {
      setError('Пароли не совпадают.');
      return;
    }

    if (isRegister && email.trim() && !isValidEmail(email)) {
      setError('Почта выглядит некорректно. Проверьте адрес или оставьте поле пустым.');
      return;
    }

    if (isRegister && !captcha.answers.includes(normalizeAnswer(captchaAnswer))) {
      setError('Руны не сошлись. Ответьте на проверку еще раз.');
      setCaptcha(pickCaptcha());
      setCaptchaAnswer('');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isRegister) {
        await onRegister(username, password, email.trim() || undefined);
      } else {
        await onLogin(username, password);
      }
    } catch (submitError) {
      setError(getReadableAuthError(
        submitError,
        'Не удалось выполнить запрос авторизации.',
      ));
    } finally {
      setIsSubmitting(false);
    }
  };

  const logout = async () => {
    setIsSubmitting(true);
    try {
      await onLogout();
    } catch (logoutError) {
      setError(getReadableAuthError(
        logoutError,
        'Не удалось выйти из аккаунта.',
      ));
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateEmail = async () => {
    setError('');
    setNotice('');

    if (!profileEmail.trim() || !isValidEmail(profileEmail)) {
      setError('Укажите корректную почту.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onUpdateEmail(profileEmail.trim());
      setNotice('Почта обновлена.');
    } catch (emailError) {
      setError(getReadableAuthError(emailError, 'Не удалось обновить почту.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const changePassword = async () => {
    setError('');
    setNotice('');

    if (!currentPassword || !newPassword) {
      setError('Введите текущий и новый пароль.');
      return;
    }

    if (newPassword !== newPasswordRepeat) {
      setError('Новый пароль и повтор не совпадают.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onChangePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordRepeat('');
      setNotice('Пароль изменен.');
    } catch (passwordError) {
      setError(getReadableAuthError(passwordError, 'Не удалось изменить пароль.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const recoverPassword = async () => {
    setError('');
    setNotice('');

    if (!username.trim()) {
      setError('Укажите ник игрока.');
      return;
    }

    setIsSubmitting(true);
    try {
      const message = await onRecoverPassword(username.trim());
      setNotice(message);
    } catch (recoveryError) {
      setError(getReadableAuthError(recoveryError, 'Не удалось начать восстановление пароля.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="settings-overlay" role="presentation" onClick={onClose}>
      <aside className="auth-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="settings-heading">
          <div>
            <p className="eyebrow">FORGE WORLD ACCOUNT</p>
            <h2>
              {isProfile ? 'Профиль игрока' : isRegister ? 'Регистрация' : 'Вход'}
            </h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть окно входа">
            <GlyphIcon name="close" />
          </button>
        </div>

        <div className={`auth-network-note ${isOnline ? 'is-online' : 'is-offline'}`}>
          <span />
          <p>{authStatus?.message ?? 'Проверяем сервер авторизации...'}</p>
        </div>

        {isProfile ? (
          <section className="auth-profile-card">
            <div className="profile-info-grid">
              <div>
                <p className="sidebar-caption">НИК ИГРОКА</p>
                <strong>{settings.username}</strong>
              </div>
              <div>
                <p className="sidebar-caption">ПОСЛЕДНИЙ ВХОД</p>
                <span>{formatDateTime(accountProfile?.lastLoginAt ?? '')}</span>
              </div>
            </div>

            <div className="profile-section">
              <div className="field-label-row">
                <label className="field-label" htmlFor="profile-email">
                  Почта
                </label>
                <span
                  className="tooltip-anchor"
                  tabIndex={0}
                  data-tooltip="Почта нужна для восстановления доступа, если вы забудете пароль. Если почта не привязана, восстановление придется делать через администрацию."
                >
                  ?
                </span>
              </div>
              <input
                id="profile-email"
                className="text-input"
                type="email"
                value={profileEmail}
                onChange={(event) => setProfileEmail(event.target.value)}
                placeholder="name@example.com"
              />
              <button type="button" className="ghost-button auth-submit-button" onClick={() => void updateEmail()} disabled={isSubmitting}>
                {accountProfile?.hasEmail ? 'Изменить почту' : 'Привязать почту'}
              </button>
            </div>

            <div className="profile-section">
              <p className="sidebar-caption">СМЕНА ПАРОЛЯ</p>
              <PasswordInput
                id="profile-current-password"
                value={currentPassword}
                onChange={setCurrentPassword}
                placeholder="Текущий пароль"
              />
              <PasswordInput
                id="profile-new-password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="Новый пароль"
              />
              <PasswordInput
                id="profile-new-password-repeat"
                value={newPasswordRepeat}
                onChange={setNewPasswordRepeat}
                placeholder="Повторите новый пароль"
              />
              <button type="button" className="ghost-button auth-submit-button" onClick={() => void changePassword()} disabled={isSubmitting}>
                Сменить пароль
              </button>
            </div>

            {notice ? <p className="auth-notice">{notice}</p> : null}
            {error ? <p className="auth-error">{error}</p> : null}
            <button type="button" className="ghost-button auth-danger-button" onClick={() => void logout()} disabled={isSubmitting}>
              Выйти из аккаунта
            </button>
          </section>
        ) : (
          <section className="auth-form-card">
            <label className="field-label" htmlFor="auth-username">
              Ник игрока
            </label>
            <input
              id="auth-username"
              className="text-input"
              maxLength={16}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Wayfarer"
            />

            <label className="field-label" htmlFor="auth-password">
              Пароль
            </label>
            <PasswordInput
              id="auth-password"
              value={password}
              onChange={setPassword}
              placeholder="Введите пароль"
            />

            {!isRegister ? (
              <button
                type="button"
                className="auth-inline-button"
                onClick={() => void recoverPassword()}
                disabled={isSubmitting}
              >
                забыли пароль?
              </button>
            ) : null}

            {isRegister ? (
              <>
                <label className="field-label" htmlFor="auth-password-repeat">
                  Повтор пароля
                </label>
                <PasswordInput
                  id="auth-password-repeat"
                  value={repeatPassword}
                  onChange={setRepeatPassword}
                  placeholder="Повторите пароль"
                />

                <div className="field-label-row">
                  <label className="field-label" htmlFor="auth-email">
                    Почта <span>необязательно</span>
                  </label>
                  <span
                    className="tooltip-anchor"
                    tabIndex={0}
                    data-tooltip="Если забудете пароль, почта поможет восстановить аккаунт через администрацию или систему AuthMe. Можно оставить пустым."
                  >
                    ?
                  </span>
                </div>
                <input
                  id="auth-email"
                  className="text-input"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                />

                <div className="captcha-card">
                  <div>
                    <p className="sidebar-caption">ПРОВЕРКА РУН</p>
                    <p>{captcha.question}</p>
                  </div>
                  <button
                    type="button"
                    className="icon-button captcha-refresh"
                    onClick={() => {
                      setCaptcha(pickCaptcha());
                      setCaptchaAnswer('');
                    }}
                    aria-label="Новая проверка"
                  >
                    <GlyphIcon name="refresh" />
                  </button>
                </div>
                <input
                  className="text-input"
                  value={captchaAnswer}
                  onChange={(event) => setCaptchaAnswer(event.target.value)}
                  placeholder="Ответ"
                />
              </>
            ) : null}

            {notice ? <p className="auth-notice">{notice}</p> : null}
            {error ? <p className="auth-error">{error}</p> : null}
            <button type="button" className="ghost-button auth-submit-button" onClick={() => void submit()} disabled={isSubmitting}>
              {isSubmitting ? 'Подождите...' : isRegister ? 'Создать аккаунт' : 'Войти'}
            </button>
          </section>
        )}
      </aside>
    </div>
  );
}
