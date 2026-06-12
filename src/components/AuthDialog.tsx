import { useEffect, useState } from 'react';
import type {
  LauncherAccountProfile,
  LauncherSettings,
  PasswordRecoveryStartResult,
  PasswordRecoveryVerifyResult,
  SidebarView,
} from '../shared/contracts';
import reloadCaptchaIcon from '../assets/reloadcapcha.png';
import { GlyphIcon } from './icons';

interface AuthDialogProps {
  mode: Extract<SidebarView, 'login' | 'register' | 'profile'>;
  settings: LauncherSettings;
  accountProfile: LauncherAccountProfile | null;
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, password: string, email?: string) => Promise<void>;
  onLogout: () => Promise<void>;
  onRefreshProfile: () => Promise<void>;
  onUpdateEmail: (email: string) => Promise<void>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  onStartPasswordRecovery: (identifier: string) => Promise<PasswordRecoveryStartResult>;
  onResendPasswordRecovery: (username: string) => Promise<PasswordRecoveryStartResult>;
  onVerifyPasswordRecovery: (username: string, code: string) => Promise<PasswordRecoveryVerifyResult>;
  onCompletePasswordRecovery: (username: string, resetToken: string, newPassword: string) => Promise<{ ok: boolean; message: string }>;
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

type RecoveryStep = 'none' | 'start' | 'code' | 'password' | 'done';

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
  {
    question: 'Алхимик смешал 1 лунный порошок и 4 искры. Сколько ингредиентов в чаше?',
    answers: ['5', 'пять'],
  },
  {
    question: 'На стене крепости 7 факелов, страж погасил 2. Сколько факелов горит?',
    answers: ['5', 'пять'],
  },
  {
    question: 'Введите металл, из которого куют простой меч: железо',
    answers: ['железо'],
  },
  {
    question: 'У ведьмы было 9 трав, 3 ушли в зелье. Сколько трав осталось?',
    answers: ['6', 'шесть'],
  },
  {
    question: 'Дракон охранял 2 сундука, гном принес еще 2. Сколько сундуков стало?',
    answers: ['4', 'четыре'],
  },
  {
    question: 'Введите слово печати: пепел',
    answers: ['пепел'],
  },
  {
    question: 'В караване 3 мага и 2 рыцаря. Сколько путников идет к воротам?',
    answers: ['5', 'пять'],
  },
  {
    question: 'На алтаре 8 кристаллов, один раскололся. Сколько целых кристаллов осталось?',
    answers: ['7', 'семь'],
  },
  {
    question: 'Сова принесла 2 письма утром и 3 ночью. Сколько писем у архивариуса?',
    answers: ['5', 'пять'],
  },
  {
    question: 'Введите имя хранителя кузни: мастер',
    answers: ['мастер'],
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
    accountProfile,
    onLogin,
    onRegister,
    onLogout,
    onRefreshProfile,
    onUpdateEmail,
    onChangePassword,
    onStartPasswordRecovery,
    onResendPasswordRecovery,
    onVerifyPasswordRecovery,
    onCompletePasswordRecovery,
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
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>('none');
  const [recoveryIdentifier, setRecoveryIdentifier] = useState(settings.username);
  const [recoveryUsername, setRecoveryUsername] = useState('');
  const [recoveryMaskedEmail, setRecoveryMaskedEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryResetToken, setRecoveryResetToken] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryPasswordRepeat, setRecoveryPasswordRepeat] = useState('');
  const [recoveryCooldown, setRecoveryCooldown] = useState(0);
  const [needsEmailWarning, setNeedsEmailWarning] = useState(false);
  const isProfile = mode === 'profile';
  const isRegister = mode === 'register';
  const isRecovery = recoveryStep !== 'none';

  useEffect(() => {
    setUsername(settings.username);
    setPassword('');
    setRepeatPassword('');
    setEmail('');
    setCaptcha(pickCaptcha());
    setCaptchaAnswer('');
    setError('');
    setNotice('');
    setRecoveryStep('none');
    setRecoveryIdentifier(settings.username);
    setRecoveryUsername('');
    setRecoveryMaskedEmail('');
    setRecoveryCode('');
    setRecoveryResetToken('');
    setRecoveryPassword('');
    setRecoveryPasswordRepeat('');
    setRecoveryCooldown(0);
    setNeedsEmailWarning(false);
  }, [mode, settings.username]);

  useEffect(() => {
    if (recoveryStep !== 'code' || recoveryCooldown <= 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setRecoveryCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [recoveryStep, recoveryCooldown]);

  useEffect(() => {
    if (isProfile) {
      void onRefreshProfile().catch(() => undefined);
    }
  }, [isProfile, onRefreshProfile]);

  useEffect(() => {
    setProfileEmail(accountProfile?.email ?? '');
  }, [accountProfile?.email]);

  const submit = async (allowMissingEmail = false) => {
    setError('');
    setNotice('');

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

    if (isRegister && !email.trim() && !allowMissingEmail) {
      setNeedsEmailWarning(true);
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

  const openRecovery = () => {
    setError('');
    setNotice('');
    setRecoveryStep('start');
    setRecoveryIdentifier(username.trim() || settings.username);
    setRecoveryUsername('');
    setRecoveryMaskedEmail('');
    setRecoveryCode('');
    setRecoveryResetToken('');
    setRecoveryPassword('');
    setRecoveryPasswordRepeat('');
    setRecoveryCooldown(0);
  };

  const closeRecovery = () => {
    setRecoveryStep('none');
    setError('');
    setNotice('');
    setRecoveryCode('');
    setRecoveryResetToken('');
    setRecoveryPassword('');
    setRecoveryPasswordRepeat('');
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

  const startRecovery = async () => {
    setError('');
    setNotice('');

    if (!recoveryIdentifier.trim()) {
      setError('Укажите ник игрока или почту.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onStartPasswordRecovery(recoveryIdentifier.trim());
      setRecoveryUsername(result.username);
      setRecoveryMaskedEmail(result.maskedEmail);
      setRecoveryCooldown(result.cooldownSeconds);
      setRecoveryCode('');
      setRecoveryStep('code');
      setNotice(result.message);
    } catch (recoveryError) {
      setError(getReadableAuthError(recoveryError, 'Не удалось начать восстановление пароля.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resendRecovery = async () => {
    setError('');
    setNotice('');

    if (!recoveryUsername) {
      setRecoveryStep('start');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onResendPasswordRecovery(recoveryUsername);
      setRecoveryMaskedEmail(result.maskedEmail);
      setRecoveryCooldown(result.cooldownSeconds);
      setRecoveryCode('');
      setNotice(result.message);
    } catch (recoveryError) {
      setError(getReadableAuthError(recoveryError, 'Не удалось отправить код повторно.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyRecovery = async () => {
    setError('');
    setNotice('');

    if (!recoveryCode.trim()) {
      setError('Введите код из письма.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onVerifyPasswordRecovery(recoveryUsername, recoveryCode.trim());
      setRecoveryResetToken(result.resetToken);
      setRecoveryPassword('');
      setRecoveryPasswordRepeat('');
      setRecoveryStep('password');
      setNotice(result.message);
    } catch (recoveryError) {
      setError(getReadableAuthError(recoveryError, 'Код не подошел. Проверьте письмо и попробуйте еще раз.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const completeRecovery = async () => {
    setError('');
    setNotice('');

    if (!recoveryPassword) {
      setError('Введите новый пароль.');
      return;
    }

    if (recoveryPassword !== recoveryPasswordRepeat) {
      setError('Новый пароль и повтор не совпадают.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onCompletePasswordRecovery(recoveryUsername, recoveryResetToken, recoveryPassword);
      setRecoveryPassword('');
      setRecoveryPasswordRepeat('');
      setRecoveryResetToken('');
      setRecoveryStep('done');
      setNotice(result.message || 'Пароль успешно изменен.');
    } catch (recoveryError) {
      setError(getReadableAuthError(recoveryError, 'Не удалось изменить пароль.'));
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
              {isProfile ? 'Профиль игрока' : isRecovery ? 'Восстановление' : isRegister ? 'Регистрация' : 'Вход'}
            </h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть окно входа">
            <GlyphIcon name="close" />
          </button>
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
        ) : isRecovery ? (
          <section className="auth-form-card recovery-card">
            {recoveryStep === 'start' ? (
              <>
                <p className="auth-helper-text">
                  Укажите ник игрока или почту, привязанную к аккаунту. На почту придет код подтверждения.
                </p>
                <label className="field-label" htmlFor="recovery-identifier">
                  Ник или почта
                </label>
                <input
                  id="recovery-identifier"
                  className="text-input"
                  value={recoveryIdentifier}
                  onChange={(event) => setRecoveryIdentifier(event.target.value)}
                  placeholder="Wayfarer или name@example.com"
                />
                <button type="button" className="ghost-button auth-submit-button" onClick={() => void startRecovery()} disabled={isSubmitting}>
                  {isSubmitting ? 'Отправляем...' : 'Получить код'}
                </button>
              </>
            ) : null}

            {recoveryStep === 'code' ? (
              <>
                <p className="auth-helper-text">
                  Код отправлен на {recoveryMaskedEmail || 'привязанную почту'}. Введите его ниже, чтобы подтвердить сброс пароля.
                </p>
                <label className="field-label" htmlFor="recovery-code">
                  Код из письма
                </label>
                <input
                  id="recovery-code"
                  className="text-input"
                  value={recoveryCode}
                  onChange={(event) => setRecoveryCode(event.target.value)}
                  placeholder="000000"
                />
                <div className="recovery-actions">
                  <button type="button" className="ghost-button auth-submit-button" onClick={() => void verifyRecovery()} disabled={isSubmitting}>
                    {isSubmitting ? 'Проверяем...' : 'Подтвердить код'}
                  </button>
                  <button
                    type="button"
                    className="ghost-button auth-secondary-button"
                    onClick={() => void resendRecovery()}
                    disabled={isSubmitting || recoveryCooldown > 0}
                  >
                    {recoveryCooldown > 0 ? `Еще раз через ${recoveryCooldown}с` : 'Отправить еще раз'}
                  </button>
                </div>
              </>
            ) : null}

            {recoveryStep === 'password' ? (
              <>
                <p className="auth-helper-text">
                  Код подтвержден. Задайте новый пароль для аккаунта {recoveryUsername}.
                </p>
                <label className="field-label" htmlFor="recovery-password">
                  Новый пароль
                </label>
                <PasswordInput
                  id="recovery-password"
                  value={recoveryPassword}
                  onChange={setRecoveryPassword}
                  placeholder="Введите новый пароль"
                />
                <label className="field-label" htmlFor="recovery-password-repeat">
                  Повтор пароля
                </label>
                <PasswordInput
                  id="recovery-password-repeat"
                  value={recoveryPasswordRepeat}
                  onChange={setRecoveryPasswordRepeat}
                  placeholder="Повторите новый пароль"
                />
                <button type="button" className="ghost-button auth-submit-button" onClick={() => void completeRecovery()} disabled={isSubmitting}>
                  {isSubmitting ? 'Сохраняем...' : 'Сменить пароль'}
                </button>
              </>
            ) : null}

            {recoveryStep === 'done' ? (
              <>
                <p className="auth-notice">Пароль успешно изменен.</p>
                <button type="button" className="ghost-button auth-submit-button" onClick={closeRecovery}>
                  Вернуться ко входу
                </button>
              </>
            ) : null}

            {recoveryStep !== 'done' && notice ? <p className="auth-notice">{notice}</p> : null}
            {error ? <p className="auth-error">{error}</p> : null}
            {recoveryStep !== 'done' ? (
              <button type="button" className="auth-inline-button recovery-back-button" onClick={closeRecovery} disabled={isSubmitting}>
                Вернуться ко входу
              </button>
            ) : null}
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
                onClick={openRecovery}
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
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setNeedsEmailWarning(false);
                  }}
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
                    <img className="captcha-refresh-icon" src={reloadCaptchaIcon} alt="" />
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

            {needsEmailWarning ? (
              <div className="auth-warning-card">
                <p>
                  Без почты восстановить пароль через лаунчер не получится. Продолжить регистрацию без почты?
                </p>
                <div className="auth-warning-actions">
                  <button type="button" className="ghost-button auth-secondary-button" onClick={() => setNeedsEmailWarning(false)}>
                    Указать почту
                  </button>
                  <button type="button" className="ghost-button auth-secondary-button" onClick={() => void submit(true)} disabled={isSubmitting}>
                    Продолжить
                  </button>
                </div>
              </div>
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
