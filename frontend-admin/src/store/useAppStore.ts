import { create } from 'zustand';
import type { AppState, ToastType, AudioSettings, SessionRecord } from '@/types';
import { generateId, getLanguageDisplayName } from '@/utils/helpers';
import { DEFAULT_AUDIO_SETTINGS, LANG_SETTINGS_STORAGE_KEY, LANGUAGES, TOAST_DURATION } from '@/utils/constants';

const STORAGE_KEY = 'subtitle-translator-session-records';

// 判断源语言与目标语言是否属于同一种语言（按语言前缀判定，如 zh-CN 与 zh-TW 视为同一种）
export const isSameLanguage = (langA: string, langB: string): boolean =>
  langA.split('-')[0] === langB.split('-')[0];

interface LangSettings {
  sourceLang: string;
  targetLang: string;
}

// 重新打开应用时恢复上次的语言选择
const loadLangSettings = (): LangSettings => {
  try {
    const stored = localStorage.getItem(LANG_SETTINGS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<LangSettings>;
      const isValid = (code?: string): code is string =>
        !!code && LANGUAGES.some(lang => lang.code === code);
      // 两个语种都合法且不同才恢复，避免把无效/同语种的历史遗留组合还原回来
      if (
        isValid(parsed.sourceLang) &&
        isValid(parsed.targetLang) &&
        !isSameLanguage(parsed.sourceLang, parsed.targetLang)
      ) {
        return { sourceLang: parsed.sourceLang, targetLang: parsed.targetLang };
      }
    }
  } catch {
    console.error('Failed to load language settings from storage');
  }
  return { sourceLang: 'zh-CN', targetLang: 'en-US' };
};

const saveLangSettings = (settings: LangSettings) => {
  try {
    localStorage.setItem(LANG_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    console.error('Failed to save language settings to storage');
  }
};

const getLangName = (code: string): string => getLanguageDisplayName(code, LANGUAGES);

const loadRecordsFromStorage = (): SessionRecord[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.map((r: SessionRecord) => ({
        ...r,
        timestamp: new Date(r.timestamp),
      }));
    }
  } catch {
    console.error('Failed to load session records from storage');
  }
  return [];
};

const saveRecordsToStorage = (records: SessionRecord[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    console.error('Failed to save session records to storage');
  }
};

export const useAppStore = create<AppState>((set, get) => {
  const initialLangSettings = loadLangSettings();

  return {
  // 控制面板状态
  sourceLang: initialLangSettings.sourceLang,
  targetLang: initialLangSettings.targetLang,
  isMicOn: false,
  isRecording: false,
  audioSettings: DEFAULT_AUDIO_SETTINGS,
  
  // 字幕状态 - 初始为空
  subtitles: [],
  currentSubtitle: '',
  
  // 翻译状态
  inputText: '',
  translationHistory: [],
  isTranslating: false,
  
  // Toast状态
  toasts: [],
  
  // 会话记录
  sessionRecords: loadRecordsFromStorage(),
  
  // Actions
  setSourceLang: (lang: string) => {
    const { sourceLang, targetLang, addToast } = get();

    // 选择未发生变化：直接忽略，不保存也不提醒（避免反复弹提醒）
    if (lang === sourceLang) return;

    // 判定口径：源语言与目标语言不允许是同一种，否则不会发生任何转换
    if (isSameLanguage(lang, targetLang)) {
      addToast(
        'warning',
        `源语言与目标语言不能同为「${getLangName(lang)}」，该组合不会产生翻译，设置未保存。请选择不同的目标语言`,
      );
      return;
    }

    set({ sourceLang: lang });
    saveLangSettings({ sourceLang: lang, targetLang });
    addToast('info', `源语言已切换为「${getLangName(lang)}」`);
  },

  setTargetLang: (lang: string) => {
    const { sourceLang, targetLang, addToast } = get();

    // 选择未发生变化：直接忽略，不保存也不提醒（避免反复弹提醒）
    if (lang === targetLang) return;

    // 判定口径：目标语言与源语言不允许是同一种，否则不会发生任何转换
    if (isSameLanguage(lang, sourceLang)) {
      addToast(
        'warning',
        `目标语言与源语言不能同为「${getLangName(lang)}」，该组合不会产生翻译，设置未保存。请选择不同的源语言`,
      );
      return;
    }

    set({ targetLang: lang });
    saveLangSettings({ sourceLang, targetLang: lang });
    addToast('info', `目标语言已切换为「${getLangName(lang)}」`);
  },
  
  toggleMic: () => {
    const { isMicOn } = get();
    const newState = !isMicOn;
    set({ isMicOn: newState, isRecording: newState });
  },
  
  setAudioSettings: (settings: Partial<AudioSettings>) => {
    set(state => ({
      audioSettings: { ...state.audioSettings, ...settings },
    }));
  },
  
  addSubtitle: (original: string, translated: string) => {
    const { sourceLang, targetLang } = get();
    set(state => ({
      subtitles: [
        ...state.subtitles.map(s => ({ ...s, isActive: false })),
        {
          id: generateId(),
          originalText: original,
          translatedText: translated,
          timestamp: new Date(),
          isActive: true,
          converted: !isSameLanguage(sourceLang, targetLang),
        },
      ],
      currentSubtitle: '',
    }));
    get().addSessionRecord({
      type: 'voice',
      sourceText: original,
      targetText: translated,
      sourceLang,
      targetLang,
    });
  },
  
  setCurrentSubtitle: (text: string) => {
    set({ currentSubtitle: text });
  },
  
  setInputText: (text: string) => {
    set({ inputText: text });
  },
  
  translate: async () => {
    const { inputText, sourceLang, targetLang, addToast, addSessionRecord } = get();

    if (!inputText.trim()) {
      addToast('warning', '请输入要翻译的文本');
      return;
    }

    // 同语种不会发生转换，不允许提交（正常路径已在语言设置处拦截）
    if (isSameLanguage(sourceLang, targetLang)) {
      addToast('warning', '源语言与目标语言相同，不会产生翻译，请先选择不同的语言');
      return;
    }
    
    set({ isTranslating: true });
    
    try {
      // 模拟翻译
      await new Promise(resolve => setTimeout(resolve, 800));
      const result = `[Translated] ${inputText}`;
      
      set(state => ({
        translationHistory: [
          {
            id: generateId(),
            sourceText: inputText,
            targetText: result,
            sourceLang,
            targetLang,
            timestamp: new Date(),
          },
          ...state.translationHistory,
        ],
        inputText: '',
        isTranslating: false,
      }));
      
      addSessionRecord({
        type: 'manual',
        sourceText: inputText,
        targetText: result,
        sourceLang,
        targetLang,
      });
      
      addToast('success', '翻译完成');
    } catch {
      set({ isTranslating: false });
      addToast('error', '翻译失败，请重试');
    }
  },
  
  addToast: (type: ToastType, message: string) => {
    const id = generateId();
    set(state => ({
      toasts: [...state.toasts, { id, type, message, duration: TOAST_DURATION }],
    }));
    
    // 自动移除
    setTimeout(() => {
      get().removeToast(id);
    }, TOAST_DURATION);
  },
  
  removeToast: (id: string) => {
    set(state => ({
      toasts: state.toasts.filter(t => t.id !== id),
    }));
  },
  
  addSessionRecord: (record) => {
    set(state => {
      const newRecord: SessionRecord = {
        id: generateId(),
        timestamp: new Date(),
        ...record,
      };
      const newRecords = [newRecord, ...state.sessionRecords];
      saveRecordsToStorage(newRecords);
      return { sessionRecords: newRecords };
    });
  },
  
  deleteSessionRecord: (id: string) => {
    set(state => {
      const newRecords = state.sessionRecords.filter(r => r.id !== id);
      saveRecordsToStorage(newRecords);
      return { sessionRecords: newRecords };
    });
    get().addToast('success', '记录已删除');
  },
  
  clearSessionRecords: () => {
    set({ sessionRecords: [] });
    saveRecordsToStorage([]);
    get().addToast('success', '所有记录已清空');
  },
  };
});
