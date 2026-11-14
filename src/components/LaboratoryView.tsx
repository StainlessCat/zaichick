import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileCheck2,
  FilePlus2,
  Filter,
  Layers,
  Play,
  Plus,
  Radiation,
  Search,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import {
  ControlResult,
  FacilityObject,
  InspectorProfile,
  NdtLabControlStage,
  NdtLabRequest,
  NdtLabRequestStatus,
  NdtMethod,
  ProjectLineItem,
  UserAccount,
  WeldJoint,
} from '../types/welding';
import { formatDateDDMMYY } from '../utils/weldingLogic';
import { formatInspectorShortName, RolePermissions } from '../utils/rbac';
import {
  buildAcceptIntoWorkJointPatch,
  buildLabConclusionPatch,
  calculateLaboratoryDeficitStatement,
  isJointConclusionCompletedForRequest,
  LabConclusionFormInput,
  NdtLineDeficitRow,
  suggestNextConclusionNumber,
  suggestNextLabRequestNumber,
} from '../utils/laboratoryLogic';

export type LaboratorySubTab = 'deficit' | 'requests' | 'conclusions';

export interface LabJointDraftRow {
  stage: NdtLabControlStage;
  includeVik: boolean;
  vikReportNumber: string;
  vikDate: string;
  vikResult: ControlResult;
  vikInspector: string;
  ndtMethod: NdtMethod;
  ndtReportNumber: string;
  ndtDate: string;
  ndtResult: ControlResult;
  ndtInspector: string;
  isDirty: boolean;
}

interface LaboratoryViewProps {
  joints: WeldJoint[];
  lineList: ProjectLineItem[];
  facilities: FacilityObject[];
  inspectors: InspectorProfile[];
  currentUser: UserAccount;
  userPermissions: RolePermissions;
  selectedObjectName: string;
  selectedRdCode: string;
  onSelectObjectName: (name: string) => void;
  onSelectRdCode: (rd: string) => void;
  labRequests: NdtLabRequest[];
  onCreateLabRequest: (newRequest: NdtLabRequest) => void;
  onAcceptLabRequest: (
    requestId: string,
    inspectorName: string,
    jointUpdates: { jointId: string; patch: Partial<WeldJoint> }[]
  ) => void;
  onSaveLabConclusions: (
    jointUpdates: { jointId: string; patch: Partial<WeldJoint> }[],
    actionSummary: string,
    relatedRequestId?: string
  ) => void;
  onOpenJointPassport: (joint: WeldJoint) => void;
}

const NDT_METHODS_LIST: NdtMethod[] = ['РК', 'УЗК', 'ПВК', 'МК', 'РК+УЗК'];
const CONTROL_STAGES_LIST: NdtLabControlStage[] = [
  'Первичный ВИК и НК',
  'Физический НК (РК/УЗК/ПВК)',
  'Повторный НК после ремонта',
  'Дублирующий контроль',
];
const CONCLUSION_RESULTS_LIST: ControlResult[] = [
  'Годен',
  'Ремонт',
  'Вырезать',
  'В работе',
];

function createDraftFromJoint(
  joint: WeldJoint,
  defaultStage: NdtLabControlStage,
  defaultInspector: string
): LabJointDraftRow {
  const todayIso = new Date().toISOString().slice(0, 10);
  const safeDate =
    joint.weldingDate && joint.weldingDate > todayIso ? joint.weldingDate : todayIso;

  if (defaultStage === 'Повторный НК после ремонта') {
    return {
      stage: defaultStage,
      includeVik: true,
      vikReportNumber: joint.repairVikNumber || '',
      vikDate: joint.repairVikDate || safeDate,
      vikResult:
        joint.repairVikResult && joint.repairVikResult !== 'Не проводился'
          ? joint.repairVikResult
          : 'Годен',
      vikInspector: joint.repairVikInspector || defaultInspector,
      ndtMethod:
        joint.repairNdtType && joint.repairNdtType !== 'Не требуется'
          ? joint.repairNdtType
          : joint.ndtType && joint.ndtType !== 'Не требуется'
          ? joint.ndtType
          : 'РК',
      ndtReportNumber: joint.repairNdtNumber || '',
      ndtDate: joint.repairNdtDate || safeDate,
      ndtResult:
        joint.repairNdtResult &&
        joint.repairNdtResult !== 'Не проводился' &&
        joint.repairNdtResult !== 'В работе'
          ? joint.repairNdtResult
          : 'Годен',
      ndtInspector: joint.repairNdtInspector || defaultInspector,
      isDirty: false,
    };
  }

  if (defaultStage === 'Дублирующий контроль') {
    return {
      stage: defaultStage,
      includeVik: false,
      vikReportNumber: joint.vikReportNumber || '',
      vikDate: joint.vikDate || safeDate,
      vikResult: joint.vikResult || 'Годен',
      vikInspector: joint.vikInspector || defaultInspector,
      ndtMethod:
        joint.dupNdtType && joint.dupNdtType !== 'Не требуется'
          ? joint.dupNdtType
          : joint.ndtType && joint.ndtType !== 'Не требуется'
          ? joint.ndtType
          : 'УЗК',
      ndtReportNumber: joint.dupNdtReportNumber || '',
      ndtDate: joint.dupNdtDate || safeDate,
      ndtResult:
        joint.dupNdtResult &&
        joint.dupNdtResult !== 'Не проводился' &&
        joint.dupNdtResult !== 'В работе'
          ? joint.dupNdtResult
          : 'Годен',
      ndtInspector: joint.dupNdtInspector || defaultInspector,
      isDirty: false,
    };
  }

  return {
    stage: defaultStage,
    includeVik: defaultStage === 'Первичный ВИК и НК',
    vikReportNumber: joint.vikReportNumber || '',
    vikDate: joint.vikDate || safeDate,
    vikResult:
      joint.vikResult &&
      joint.vikResult !== 'Не проводился' &&
      joint.vikResult !== 'В работе'
        ? joint.vikResult
        : 'Годен',
    vikInspector: joint.vikInspector || defaultInspector,
    ndtMethod:
      joint.ndtType && joint.ndtType !== 'Не требуется' ? joint.ndtType : 'РК',
    ndtReportNumber: joint.ndtReportNumber || '',
    ndtDate: joint.ndtDate || safeDate,
    ndtResult:
      joint.ndtResult &&
      joint.ndtResult !== 'Не проводился' &&
      joint.ndtResult !== 'В работе'
        ? joint.ndtResult
        : 'Годен',
    ndtInspector: joint.ndtInspector || defaultInspector,
    isDirty: false,
  };
}

export const LaboratoryView: React.FC<LaboratoryViewProps> = ({
  joints,
  lineList,
  facilities,
  inspectors,
  currentUser,
  selectedObjectName,
  selectedRdCode,
  onSelectRdCode,
  labRequests,
  onCreateLabRequest,
  onAcceptLabRequest,
  onSaveLabConclusions,
  onOpenJointPassport,
}) => {
  const [activeTab, setActiveTab] = useState<LaboratorySubTab>('deficit');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyDeficitLines, setOnlyDeficitLines] = useState(false);
  const [expandedRdCodes, setExpandedRdCodes] = useState<Record<string, boolean>>({});
  const [requestStatusFilter, setRequestStatusFilter] = useState<'ALL' | NdtLabRequestStatus>('ALL');
  const [activeRequestIdForConclusions, setActiveRequestIdForConclusions] =
    useState<string>('ALL');
  const [conclusionLineFilter, setConclusionLineFilter] = useState<string>('ALL');
  const [conclusionStateFilter, setConclusionStateFilter] = useState<
    'ALL' | 'PENDING' | 'COMPLETED'
  >('ALL');

  // Состояние модального/встроенного конструктора новой заявки на НК от инженера ПТО
  const [requestModalState, setRequestModalState] = useState<{
    isOpen: boolean;
    lineRow: NdtLineDeficitRow | null;
    selectedJointIds: string[];
    controlStage: NdtLabControlStage;
    requestedMethod: NdtMethod;
    ptoEngineerName: string;
    notes: string;
  }>({
    isOpen: false,
    lineRow: null,
    selectedJointIds: [],
    controlStage: 'Первичный ВИК и НК',
    requestedMethod: 'РК',
    ptoEngineerName: currentUser.fullName || 'Смирнов А.В. (Инженер ПТО)',
    notes: '',
  });

  // Выбранный дефектоскопист по умолчанию
  const defaultInspectorName = useMemo(() => {
    const shortCurrent = formatInspectorShortName(currentUser.fullName);
    if (
      shortCurrent &&
      inspectors.some((i) => i.fullName.toLowerCase() === shortCurrent.toLowerCase())
    ) {
      return shortCurrent;
    }
    return inspectors[0]?.fullName || shortCurrent || 'Орлова Е.В.';
  }, [currentUser.fullName, inspectors]);

  const [selectedInspectorForAccept, setSelectedInspectorForAccept] =
    useState<string>(defaultInspectorName);

  useEffect(() => {
    setSelectedInspectorForAccept(defaultInspectorName);
  }, [defaultInspectorName]);

  // Уведомление об успешной операции внутри раздела Лаборатории
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showBanner = (type: 'success' | 'error', message: string) => {
    setStatusBanner({ type, message });
    window.setTimeout(() => {
      setStatusBanner((prev) => (prev?.message === message ? null : prev));
    }, 6000);
  };

  // Расчёт дефицитной ведомости по шифрам РД и линиям
  const deficitStatement = useMemo(
    () =>
      calculateLaboratoryDeficitStatement(
        joints,
        lineList,
        selectedObjectName,
        selectedRdCode
      ),
    [joints, lineList, selectedObjectName, selectedRdCode]
  );

  // По умолчанию раскрываем все группы шифров РД
  useEffect(() => {
    setExpandedRdCodes((prev) => {
      const next = { ...prev };
      for (const g of deficitStatement.rdGroups) {
        if (next[g.rdCode] === undefined) {
          next[g.rdCode] = true;
        }
      }
      return next;
    });
  }, [deficitStatement.rdGroups]);

  const jointsById = useMemo(() => {
    const m = new Map<string, WeldJoint>();
    for (const j of joints) m.set(j.id, j);
    return m;
  }, [joints]);

  // Отфильтрованные группы дефицитной ведомости
  const filteredRdGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return deficitStatement.rdGroups
      .map((group) => {
        const filteredLines = group.lines.filter((line) => {
          if (onlyDeficitLines && !line.hasDeficit) return false;
          if (!q) return true;
          return (
            line.rdCode.toLowerCase().includes(q) ||
            line.lineNumber.toLowerCase().includes(q) ||
            line.uniqueLineId.toLowerCase().includes(q) ||
            line.contour.toLowerCase().includes(q) ||
            line.lineName.toLowerCase().includes(q)
          );
        });
        return {
          ...group,
          lines: filteredLines,
        };
      })
      .filter((g) => g.lines.length > 0);
  }, [deficitStatement.rdGroups, onlyDeficitLines, searchQuery]);

  // Отфильтрованные заявки на НК
  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return labRequests.filter((req) => {
      if (selectedObjectName !== 'ALL' && req.objectName !== selectedObjectName) {
        return false;
      }
      if (selectedRdCode !== 'ALL' && req.rdCode !== selectedRdCode) {
        return false;
      }
      if (requestStatusFilter !== 'ALL' && req.status !== requestStatusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        req.requestNumber.toLowerCase().includes(q) ||
        req.rdCode.toLowerCase().includes(q) ||
        req.lineNumber.toLowerCase().includes(q) ||
        req.uniqueLineId.toLowerCase().includes(q) ||
        req.createdBy.toLowerCase().includes(q) ||
        (req.acceptedBy || '').toLowerCase().includes(q)
      );
    });
  }, [labRequests, requestStatusFilter, searchQuery, selectedObjectName, selectedRdCode]);

  // Счётчики заявок по статусам
  const requestCounts = useMemo(() => {
    const scoped = labRequests.filter((r) => {
      if (selectedObjectName !== 'ALL' && r.objectName !== selectedObjectName) return false;
      if (selectedRdCode !== 'ALL' && r.rdCode !== selectedRdCode) return false;
      return true;
    });
    return {
      total: scoped.length,
      submitted: scoped.filter((r) => r.status === 'Подана ПТО').length,
      inWork: scoped.filter((r) => r.status === 'В работе ЛНК').length,
      completed: scoped.filter((r) => r.status === 'Выполнена').length,
    };
  }, [labRequests, selectedObjectName, selectedRdCode]);

  // Открытие конструктора заявки от инженера ПТО по конкретной линии дефицитной ведомости
  const handleOpenCreateRequestModal = (lineRow?: NdtLineDeficitRow) => {
    const targetRow =
      lineRow ||
      deficitStatement.allLineRows.find((r) => r.candidateJoints.length > 0) ||
      deficitStatement.allLineRows[0] ||
      null;

    if (!targetRow) {
      showBanner('error', 'В выбранном контуре нет сваренных стыков для подачи заявки в ЛНК.');
      return;
    }

    const neededCount = Math.max(
      targetRow.rkDeficit,
      targetRow.uzkDeficit,
      targetRow.pvkDeficit,
      targetRow.vikDeficit,
      targetRow.candidateJoints.length
    );

    const pool =
      targetRow.candidateJoints.length > 0
        ? targetRow.candidateJoints
        : targetRow.allWeldedJoints;

    const initialSelected = pool
      .slice(0, Math.max(1, neededCount))
      .map((j) => j.id);

    setRequestModalState({
      isOpen: true,
      lineRow: targetRow,
      selectedJointIds: initialSelected,
      controlStage:
        targetRow.inRepairCount > 0
          ? 'Повторный НК после ремонта'
          : targetRow.vikDeficit > 0
          ? 'Первичный ВИК и НК'
          : 'Физический НК (РК/УЗК/ПВК)',
      requestedMethod: targetRow.recommendedMethod,
      ptoEngineerName:
        currentUser.fullName && currentUser.login
          ? `${currentUser.fullName}`
          : 'Смирнов А.В. (Инженер ПТО)',
      notes: `Контроль сваренных стыков линии ${targetRow.lineNumber} (норма РК ${targetRow.rkPlanPct}%, УЗК ${targetRow.uzkPlanPct}%, ПВК ${targetRow.pvkPlanPct}%)`,
    });
  };

  // Отправка заявки от инженера ПТО в Лабораторию НК
  const handleSubmitNewRequest = () => {
    const {
      lineRow,
      selectedJointIds,
      controlStage,
      requestedMethod,
      ptoEngineerName,
      notes,
    } = requestModalState;

    if (!lineRow || selectedJointIds.length === 0) {
      showBanner('error', 'Выберите хотя бы один сваренный стык для включения в заявку на НК.');
      return;
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5);
    const reqNumber = suggestNextLabRequestNumber(labRequests);

    const newReq: NdtLabRequest = {
      id: `lab-req-${Date.now()}`,
      requestNumber: reqNumber,
      createdAt: `${dateStr} ${timeStr}`,
      createdDate: dateStr,
      createdBy: ptoEngineerName.trim() || 'Инженер ПТО',
      objectName: lineRow.objectName,
      rdCode: lineRow.rdCode,
      lineNumber: lineRow.lineNumber,
      uniqueLineId: lineRow.uniqueLineId,
      contour: lineRow.contour,
      controlStage,
      requestedMethod,
      jointIds: selectedJointIds,
      status: 'Подана ПТО',
      notes: notes.trim(),
    };

    onCreateLabRequest(newReq);
    setRequestModalState((prev) => ({ ...prev, isOpen: false }));
    setActiveTab('requests');
    showBanner(
      'success',
      `Заявка № ${reqNumber} (${selectedJointIds.length} ст., метод ${requestedMethod}) сформирована инженером ПТО и передана в Лабораторию НК.`
    );
  };

  // Приёмка заявки дефектоскопистом в работу
  const handleAcceptRequestClick = (req: NdtLabRequest) => {
    const inspector = selectedInspectorForAccept.trim() || defaultInspectorName;
    const updates: { jointId: string; patch: Partial<WeldJoint> }[] = [];

    for (const jId of req.jointIds) {
      const joint = jointsById.get(jId);
      if (!joint) continue;
      const patch = buildAcceptIntoWorkJointPatch(joint, req, inspector);
      updates.push({ jointId: jId, patch });
    }

    onAcceptLabRequest(req.id, inspector, updates);
    showBanner(
      'success',
      `Заявка № ${req.requestNumber} принята в работу дефектоскопистом (${inspector}). Статус ${updates.length} стыков обновлён на «В работе» во всех разделах системы.`
    );
  };

  // Переход из заявки к оформлению заключений
  const handleOpenRequestInConclusions = (req: NdtLabRequest) => {
    setActiveRequestIdForConclusions(req.id);
    setConclusionLineFilter('ALL');
    setConclusionStateFilter('ALL');
    setActiveTab('conclusions');
  };

  // Список стыков для вкладки «Ведомость контроля и оформление заключений»
  const activeRequestObj = useMemo(
    () =>
      activeRequestIdForConclusions === 'ALL'
        ? null
        : labRequests.find((r) => r.id === activeRequestIdForConclusions) || null,
    [activeRequestIdForConclusions, labRequests]
  );

  const conclusionTargetJoints = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const defaultStage: NdtLabControlStage =
      activeRequestObj?.controlStage || 'Первичный ВИК и НК';

    let baseList: WeldJoint[];
    if (activeRequestObj) {
      const idSet = new Set(activeRequestObj.jointIds);
      baseList = joints.filter((j) => idSet.has(j.id));
    } else {
      baseList = joints.filter((j) => {
        if (!j.weldingDate || !j.weldingDate.trim()) return false;
        if (selectedObjectName !== 'ALL' && j.objectName !== selectedObjectName) {
          return false;
        }
        if (selectedRdCode !== 'ALL' && j.rdCode !== selectedRdCode) {
          return false;
        }
        if (
          conclusionLineFilter !== 'ALL' &&
          j.uniqueLineId !== conclusionLineFilter
        ) {
          return false;
        }
        return true;
      });
    }

    return baseList.filter((j) => {
      const isCompleted = isJointConclusionCompletedForRequest(j, defaultStage);
      if (conclusionStateFilter === 'PENDING' && isCompleted) return false;
      if (conclusionStateFilter === 'COMPLETED' && !isCompleted) return false;
      if (!q) return true;
      return (
        j.jointNumber.toLowerCase().includes(q) ||
        j.lineNumber.toLowerCase().includes(q) ||
        j.rdCode.toLowerCase().includes(q) ||
        j.welderStamp.toLowerCase().includes(q) ||
        (j.ndtReportNumber || '').toLowerCase().includes(q) ||
        (j.vikReportNumber || '').toLowerCase().includes(q)
      );
    });
  }, [
    activeRequestObj,
    conclusionLineFilter,
    conclusionStateFilter,
    joints,
    searchQuery,
    selectedObjectName,
    selectedRdCode,
  ]);

  // Локальные черновики строк ведомости заключений
  const [draftRows, setDraftRows] = useState<Record<string, LabJointDraftRow>>({});
  const [selectedConclusionJointIds, setSelectedConclusionJointIds] = useState<string[]>([]);

  // Пакетные параметры для быстрого заполнения выбранных стыков ведомости
  const [batchPreset, setBatchPreset] = useState<{
    stage: NdtLabControlStage;
    includeVik: boolean;
    ndtMethod: NdtMethod;
    ndtResult: ControlResult;
    ndtDate: string;
    ndtInspector: string;
    baseReportNumber: string;
    autoIncrementNumber: boolean;
  }>({
    stage: 'Первичный ВИК и НК',
    includeVik: true,
    ndtMethod: 'РК',
    ndtResult: 'Годен',
    ndtDate: new Date().toISOString().slice(0, 10),
    ndtInspector: defaultInspectorName,
    baseReportNumber: '',
    autoIncrementNumber: true,
  });

  useEffect(() => {
    if (activeRequestObj) {
      setBatchPreset((prev) => ({
        ...prev,
        stage: activeRequestObj.controlStage,
        includeVik: activeRequestObj.controlStage === 'Первичный ВИК и НК',
        ndtMethod: activeRequestObj.requestedMethod,
        ndtInspector: activeRequestObj.acceptedBy || defaultInspectorName,
      }));
    }
  }, [activeRequestObj, defaultInspectorName]);

  const getRowDraft = (joint: WeldJoint): LabJointDraftRow => {
    const existing = draftRows[joint.id];
    if (existing) return existing;
    const defaultStage = activeRequestObj?.controlStage || 'Первичный ВИК и НК';
    const defaultInsp = activeRequestObj?.acceptedBy || defaultInspectorName;
    const created = createDraftFromJoint(joint, defaultStage, defaultInsp);
    if (activeRequestObj?.requestedMethod) {
      created.ndtMethod = activeRequestObj.requestedMethod;
    }
    return created;
  };

  const updateRowDraft = (
    joint: WeldJoint,
    patch: Partial<LabJointDraftRow>
  ) => {
    setDraftRows((prev) => {
      const current = prev[joint.id] || getRowDraft(joint);
      return {
        ...prev,
        [joint.id]: {
          ...current,
          ...patch,
          isDirty: true,
        },
      };
    });
  };

  // Оформление заключения по одному стыку в строке ведомости
  const handleCommitSingleJointConclusion = (joint: WeldJoint) => {
    const row = getRowDraft(joint);
    const reportNumToUse =
      row.ndtReportNumber.trim() ||
      suggestNextConclusionNumber(joints, row.ndtMethod);

    const input: LabConclusionFormInput = {
      stage: row.stage,
      includeVik: row.includeVik,
      vikReportNumber:
        row.vikReportNumber.trim() || `ВИК-${reportNumToUse}`,
      vikDate: row.vikDate,
      vikResult: row.vikResult,
      vikInspector: row.vikInspector || row.ndtInspector || defaultInspectorName,
      ndtMethod: row.ndtMethod,
      ndtReportNumber: reportNumToUse,
      ndtDate: row.ndtDate,
      ndtResult: row.ndtResult,
      ndtInspector: row.ndtInspector || defaultInspectorName,
    };

    const res = buildLabConclusionPatch(joint, input);
    if (!res.ok) {
      showBanner('error', res.error || 'Ошибка проверки реквизитов заключения НК.');
      return;
    }

    onSaveLabConclusions(
      [{ jointId: joint.id, patch: res.patch }],
      `Оформлено заключение НК № ${reportNumToUse} (${input.ndtMethod}: ${input.ndtResult}) по стыку № ${joint.jointNumber}`,
      activeRequestObj?.id
    );

    setDraftRows((prev) => {
      const next = { ...prev };
      delete next[joint.id];
      return next;
    });

    showBanner(
      'success',
      `Заключение № ${reportNumToUse} (${input.ndtMethod} — «${input.ndtResult}») по стыку № ${joint.jointNumber} внесено в ведомость и синхронизировано во всех разделах программы.`
    );
  };

  // Пакетное применение и сохранение заключений по выбранным (или всем изменённым) стыкам ведомости
  const handleApplyBatchConclusions = () => {
    const targetJoints =
      selectedConclusionJointIds.length > 0
        ? conclusionTargetJoints.filter((j) =>
            selectedConclusionJointIds.includes(j.id)
          )
        : conclusionTargetJoints;

    if (targetJoints.length === 0) {
      showBanner('error', 'Нет стыков для пакетного оформления заключений.');
      return;
    }

    const baseNum =
      batchPreset.baseReportNumber.trim() ||
      suggestNextConclusionNumber(joints, batchPreset.ndtMethod);

    const updates: { jointId: string; patch: Partial<WeldJoint> }[] = [];

    for (let idx = 0; idx < targetJoints.length; idx++) {
      const joint = targetJoints[idx];
      let reportNumber = baseNum;
      if (batchPreset.autoIncrementNumber && targetJoints.length > 1) {
        const match = baseNum.match(/^(.*?)(\d+)$/);
        if (match) {
          const prefix = match[1];
          const startSeq = parseInt(match[2], 10);
          const padLen = match[2].length;
          reportNumber = `${prefix}${String(startSeq + idx).padStart(padLen, '0')}`;
        } else {
          reportNumber = `${baseNum}-${idx + 1}`;
        }
      }

      const effectiveDate =
        batchPreset.ndtDate && joint.weldingDate && batchPreset.ndtDate < joint.weldingDate
          ? joint.weldingDate
          : batchPreset.ndtDate;

      const input: LabConclusionFormInput = {
        stage: batchPreset.stage,
        includeVik: batchPreset.includeVik,
        vikReportNumber: `ВИК-${reportNumber}`,
        vikDate: effectiveDate,
        vikResult:
          batchPreset.ndtResult === 'Годен' ? 'Годен' : batchPreset.ndtResult,
        vikInspector: batchPreset.ndtInspector || defaultInspectorName,
        ndtMethod: batchPreset.ndtMethod,
        ndtReportNumber: reportNumber,
        ndtDate: effectiveDate,
        ndtResult: batchPreset.ndtResult,
        ndtInspector: batchPreset.ndtInspector || defaultInspectorName,
      };

      const built = buildLabConclusionPatch(joint, input);
      if (!built.ok) {
        showBanner('error', built.error || 'Ошибка пакетного оформления заключений.');
        return;
      }
      updates.push({ jointId: joint.id, patch: built.patch });
    }

    onSaveLabConclusions(
      updates,
      `Пакетное оформление заключений ЛНК (${updates.length} ст., метод ${batchPreset.ndtMethod}, результат «${batchPreset.ndtResult}»)`,
      activeRequestObj?.id
    );

    setDraftRows({});
    setSelectedConclusionJointIds([]);
    showBanner(
      'success',
      `Оформлено и внесено в ведомость ${updates.length} заключений НК (${batchPreset.ndtMethod} — «${batchPreset.ndtResult}»). Данные обновлены в Реестре, Лайнлисте, Журналах и Сводке готовности.`
    );
  };

  // Сохранение всех строк, отредактированных вручную в таблице ведомости
  const dirtyJointsCount = useMemo(
    () =>
      conclusionTargetJoints.filter((j) => draftRows[j.id]?.isDirty).length,
    [conclusionTargetJoints, draftRows]
  );

  const handleSaveAllDirtyRows = () => {
    const dirtyJoints = conclusionTargetJoints.filter(
      (j) => draftRows[j.id]?.isDirty
    );
    if (dirtyJoints.length === 0) return;

    const updates: { jointId: string; patch: Partial<WeldJoint> }[] = [];
    for (const joint of dirtyJoints) {
      const row = getRowDraft(joint);
      const reportNum =
        row.ndtReportNumber.trim() ||
        suggestNextConclusionNumber(joints, row.ndtMethod);
      const input: LabConclusionFormInput = {
        stage: row.stage,
        includeVik: row.includeVik,
        vikReportNumber: row.vikReportNumber.trim() || `ВИК-${reportNum}`,
        vikDate: row.vikDate,
        vikResult: row.vikResult,
        vikInspector: row.vikInspector || row.ndtInspector || defaultInspectorName,
        ndtMethod: row.ndtMethod,
        ndtReportNumber: reportNum,
        ndtDate: row.ndtDate,
        ndtResult: row.ndtResult,
        ndtInspector: row.ndtInspector || defaultInspectorName,
      };
      const built = buildLabConclusionPatch(joint, input);
      if (!built.ok) {
        showBanner('error', built.error || 'Ошибка проверки строки ведомости.');
        return;
      }
      updates.push({ jointId: joint.id, patch: built.patch });
    }

    onSaveLabConclusions(
      updates,
      `Сохранение ведомости заключений ЛНК (${updates.length} ст.)`,
      activeRequestObj?.id
    );
    setDraftRows({});
    showBanner(
      'success',
      `Сохранено ${updates.length} заключений в ведомости Лаборатории НК. Результаты синхронизированы со всеми разделами.`
    );
  };

  // Экспорт дефицитной ведомости в CSV
  const handleExportDeficitCsv = () => {
    const headers = [
      'Объект',
      'Шифр РД',
      'Линия',
      'Контур испытания',
      'Категория',
      'Всего стыков',
      'Сварено стыков',
      'ВИК План (100%)',
      'ВИК Выполнено',
      'ВИК Дефицит',
      'РК Норма %',
      'РК Требуется (шт)',
      'РК Выполнено (шт)',
      'РК Дефицит (шт)',
      'УЗК Норма %',
      'УЗК Требуется (шт)',
      'УЗК Выполнено (шт)',
      'УЗК Дефицит (шт)',
      'ПВК Норма %',
      'ПВК Требуется (шт)',
      'ПВК Выполнено (шт)',
      'ПВК Дефицит (шт)',
      'Дефицит по сварщикам',
    ];
    const rows = deficitStatement.allLineRows.map((r) => [
      r.objectName,
      r.rdCode,
      r.lineNumber,
      r.contour,
      r.pipelineCategory,
      r.totalJoints,
      r.weldedCount,
      r.vikRequired,
      r.vikCompleted,
      r.vikDeficit,
      `${r.rkPlanPct}%`,
      r.rkRequired,
      r.rkCompleted,
      r.rkDeficit,
      `${r.uzkPlanPct}%`,
      r.uzkRequired,
      r.uzkCompleted,
      r.uzkDeficit,
      `${r.pvkPlanPct}%`,
      r.pvkRequired,
      r.pvkCompleted,
      r.pvkDeficit,
      r.welderDeficits
        .map((w) => `${w.stamp} (${w.controlledCount}/${w.requiredCount})`)
        .join(', '),
    ]);

    const csvContent =
      '\uFEFF' +
      [headers, ...rows]
        .map((row) =>
          row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')
        )
        .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Дефицитная_ведомость_ЛНК_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentFacility = facilities.find((f) => f.name === selectedObjectName);
  const availableRdCodes = useMemo(() => {
    if (selectedObjectName !== 'ALL' && currentFacility) {
      return currentFacility.rdCodes;
    }
    const seen = new Set<string>();
    const list: { code: string; title: string; contours: string[] }[] = [];
    for (const fac of facilities) {
      for (const rd of fac.rdCodes) {
        if (!seen.has(rd.code)) {
          seen.add(rd.code);
          list.push(rd);
        }
      }
    }
    return list;
  }, [currentFacility, facilities, selectedObjectName]);

  return (
    <div className="space-y-4">
      {/* Шапка раздела «Лаборатория НК» и сквозная панель KPI */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Radiation className="w-3.5 h-3.5 text-[#1e3799] shrink-0" />
              <span>Лаборатория НК</span>
              <span aria-hidden="true">·</span>
              <span>
                {selectedObjectName === 'ALL'
                  ? 'Все объекты строительства'
                  : selectedObjectName}
              </span>
              <span aria-hidden="true">·</span>
              <span>СТО Газпром 15-1.1-002-2023 / ГОСТ 32569-2013</span>
            </div>
            <h2
              className="text-lg sm:text-xl font-bold text-slate-900"
              style={{ fontFamily: '"Jost", sans-serif' }}
            >
              Заявки на НК от ПТО, дефицитная ведомость по квотам и выпуск заключений
            </h2>
          </div>

          {/* Селектор Шифра РД и экспорт дефицитной ведомости */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedRdCode}
              onChange={(e) => onSelectRdCode(e.target.value)}
              aria-label="Фильтр по шифру РД"
              className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#1e3799] cursor-pointer"
            >
              <option value="ALL">Все шифры РД</option>
              {availableRdCodes.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.code}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleExportDeficitCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-300 hover:border-[#1e3799] text-slate-700 hover:text-[#1e3799] text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Выгрузить ведомость (.CSV)</span>
            </button>
          </div>
        </div>

        {/* Сводная полоса производственных показателей Лаборатории (tabular-nums) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2 border-t border-slate-100">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
            <div className="text-[11px] text-slate-500 font-medium">
              Сварено стыков в контуре
            </div>
            <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
              {deficitStatement.totals.totalWelded}
              <span className="text-xs font-normal text-slate-500 ml-1">
                шт. ({deficitStatement.totals.totalLines} лин.)
              </span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200">
            <div className="text-[11px] text-amber-900 font-medium">
              Дефицит РК (по квоте %)
            </div>
            <div className="mt-1 text-xl font-bold font-mono tabular-nums text-amber-800">
              {deficitStatement.totals.rkDeficit}
              <span className="text-xs font-normal text-amber-700 ml-1">ст.</span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-sky-50/70 border border-sky-200">
            <div className="text-[11px] text-sky-900 font-medium">
              Дефицит УЗК / ПВК
            </div>
            <div className="mt-1 text-xl font-bold font-mono tabular-nums text-sky-900">
              {deficitStatement.totals.uzkDeficit}
              <span className="text-xs font-normal text-sky-700 mx-1">/</span>
              {deficitStatement.totals.pvkDeficit}
              <span className="text-xs font-normal text-sky-700 ml-1">ст.</span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-indigo-50/70 border border-indigo-200">
            <div className="text-[11px] text-indigo-900 font-medium">
              Новые заявки от ПТО
            </div>
            <div className="mt-1 text-xl font-bold font-mono tabular-nums text-[#1e3799]">
              {requestCounts.submitted}
              <span className="text-xs font-normal text-slate-600 ml-1">
                ожидают приёмки
              </span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-amber-50/50 border border-amber-200">
            <div className="text-[11px] text-slate-700 font-medium">
              Принято в работу ЛНК
            </div>
            <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
              {requestCounts.inWork}
              <span className="text-xs font-normal text-slate-500 ml-1">
                заявок в контроле
              </span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200">
            <div className="text-[11px] text-emerald-900 font-medium">
              Выполнено заявок (с заключениями)
            </div>
            <div className="mt-1 text-xl font-bold font-mono tabular-nums text-emerald-800">
              {requestCounts.completed}
              <span className="text-xs font-normal text-emerald-700 ml-1">
                закрыто ЛНК
              </span>
            </div>
          </div>
        </div>

        {/* Переключатель 3 рабочих контуров раздела Лаборатории + Поиск */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
          <div
            className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg"
            role="tablist"
            aria-label="Рабочие вкладки раздела Лаборатория"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'deficit'}
              onClick={() => setActiveTab('deficit')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'deficit'
                  ? 'bg-[#1e3799] text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-950 hover:bg-white/60'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>1. Дефицитная ведомость (по шифрам РД и линиям)</span>
              <span className="font-mono tabular-nums text-[11px] opacity-85">
                ({deficitStatement.totals.deficitLinesCount}/
                {deficitStatement.totals.totalLines})
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'requests'}
              onClick={() => setActiveTab('requests')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'requests'
                  ? 'bg-[#1e3799] text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-950 hover:bg-white/60'
              }`}
            >
              <Radiation className="w-3.5 h-3.5" />
              <span>2. Заявки на НК от ПТО и приёмка в работу</span>
              <span className="font-mono tabular-nums text-[11px] opacity-85">
                ({requestCounts.total})
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'conclusions'}
              onClick={() => setActiveTab('conclusions')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'conclusions'
                  ? 'bg-[#1e3799] text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-950 hover:bg-white/60'
              }`}
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>3. Выдача заключений НК и ведомость результатов</span>
              <span className="font-mono tabular-nums text-[11px] opacity-85">
                ({conclusionTargetJoints.length} ст.)
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-md min-w-[240px]">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по шифру РД, линии, № стыка, клейму или № заключения..."
                className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-[#1e3799]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Информационное уведомление о результате операции */}
      {statusBanner && (
        <div
          role="status"
          className={`px-4 py-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-3 ${
            statusBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
              : 'bg-rose-50 border-rose-300 text-rose-950'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{statusBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="p-1 rounded hover:bg-black/5 text-slate-600 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ================================================================== */}
      {/* ВКЛАДКА 1: ДЕФИЦИТНАЯ ВЕДОМОСТЬ НК ПО ШИФРАМ РД И ЛИНИЯМ           */}
      {/* ================================================================== */}
      {activeTab === 'deficit' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                Дефицитная ведомость неразрушающего контроля (по шифрам РД и линиям проекта)
              </h3>
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyDeficitLines}
                  onChange={(e) => setOnlyDeficitLines(e.target.checked)}
                  className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799]"
                />
                <span>Показать только линии с дефицитом контроля</span>
              </label>
            </div>

            <div className="text-[11px] text-slate-500">
              Норматив контроля берётся из «Проекта (лайнлиста)»: <span className="font-mono">Q_треб = ceil(N_свар × %_контр / 100)</span>
            </div>
          </div>

          {filteredRdGroups.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <div className="text-sm font-semibold text-slate-700">
                По заданным фильтрам линии с дефицитом НК не найдены
              </div>
              <p className="text-xs text-slate-500">
                Сбросьте фильтр «Только линии с дефицитом» или выберите другой объект / шифр РД.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredRdGroups.map((group) => {
                const isExpanded = expandedRdCodes[group.rdCode] !== false;
                return (
                  <div key={group.rdCode} className="bg-white">
                    {/* Заголовок группы Шифра РД */}
                    <div className="px-4 py-2.5 bg-[#f4f8fe] flex flex-wrap items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedRdCodes((prev) => ({
                            ...prev,
                            [group.rdCode]: !isExpanded,
                          }))
                        }
                        className="inline-flex items-center gap-2 text-left cursor-pointer"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-[#1e3799]" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-[#1e3799]" />
                        )}
                        <span className="font-mono font-bold text-xs sm:text-sm text-[#1e3799]">
                          Шифр РД: {group.rdCode}
                        </span>
                        <span className="text-xs text-slate-600">
                          · {group.objectName} · Линий: {group.lines.length}
                        </span>
                      </button>

                      <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums text-slate-700">
                        <span>
                          Сварено: <strong>{group.weldedCount}</strong>/{group.totalJoints} ст.
                        </span>
                        <span>
                          ВИК (100%): <strong>{group.vikCompleted}</strong>/{group.vikRequired}
                          {group.vikDeficit > 0 && (
                            <span className="text-amber-700 font-bold ml-1">
                              (дефицит {group.vikDeficit})
                            </span>
                          )}
                        </span>
                        <span>
                          РК: <strong>{group.rkCompleted}</strong>/{group.rkRequired}
                          {group.rkDeficit > 0 && (
                            <span className="text-rose-700 font-bold ml-1">
                              (дефицит {group.rkDeficit})
                            </span>
                          )}
                        </span>
                        <span>
                          УЗК: <strong>{group.uzkCompleted}</strong>/{group.uzkRequired}
                          {group.uzkDeficit > 0 && (
                            <span className="text-amber-700 font-bold ml-1">
                              (дефицит {group.uzkDeficit})
                            </span>
                          )}
                        </span>
                        {group.pvkRequired > 0 && (
                          <span>
                            ПВК: <strong>{group.pvkCompleted}</strong>/{group.pvkRequired}
                            {group.pvkDeficit > 0 && (
                              <span className="text-amber-700 font-bold ml-1">
                                (дефицит {group.pvkDeficit})
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Таблица линий внутри Шифра РД */}
                    {isExpanded && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-900 text-white font-mono text-[11px]">
                              <th className="py-2.5 px-3">Линия / Контур ГИ</th>
                              <th className="py-2.5 px-2.5 text-center">Кат. / Ур.</th>
                              <th className="py-2.5 px-2.5 text-right">Сварено / Всего</th>
                              <th className="py-2.5 px-3 text-center">ВИК (норма 100%)</th>
                              <th className="py-2.5 px-3 text-center">РК (% по проекту)</th>
                              <th className="py-2.5 px-3 text-center">УЗК (% по проекту)</th>
                              <th className="py-2.5 px-3 text-center">ПВК (% по проекту)</th>
                              <th className="py-2.5 px-3">Квота по сварщикам</th>
                              <th className="py-2.5 px-3 text-center">Статус квоты НК</th>
                              <th className="py-2.5 px-3 text-right">Заявка от ПТО в ЛНК</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {group.lines.map((line) => (
                              <tr
                                key={line.uniqueLineId}
                                className={
                                  line.hasDeficit
                                    ? 'bg-amber-50/40 hover:bg-amber-50/80 transition-colors'
                                    : 'bg-white hover:bg-slate-50 transition-colors'
                                }
                              >
                                <td className="py-2.5 px-3">
                                  <div className="font-mono font-bold text-slate-900">
                                    {line.lineNumber}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    {line.contour} · {line.controlNtd}
                                  </div>
                                </td>

                                <td className="py-2.5 px-2.5 text-center font-mono tabular-nums text-slate-700">
                                  {line.pipelineCategory || '—'} / {line.qualityLevel || '—'}
                                </td>

                                <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                                  <span className="font-bold text-slate-900">
                                    {line.weldedCount}
                                  </span>
                                  <span className="text-slate-400"> / {line.totalJoints}</span>
                                  {line.inRepairCount > 0 && (
                                    <div className="text-[10px] text-rose-700 font-semibold">
                                      В ремонте: {line.inRepairCount} ст.
                                    </div>
                                  )}
                                </td>

                                {/* ВИК 100% */}
                                <td className="py-2.5 px-3 text-center font-mono tabular-nums">
                                  <div>
                                    <span className="font-bold text-slate-900">
                                      {line.vikCompleted}
                                    </span>
                                    <span className="text-slate-500">
                                      /{line.vikRequired} ({line.vikActualPct}%)
                                    </span>
                                  </div>
                                  {line.vikDeficit > 0 ? (
                                    <div className="text-[11px] text-amber-800 font-semibold">
                                      Дефицит: {line.vikDeficit} ст.
                                    </div>
                                  ) : (
                                    <div className="text-[11px] text-emerald-700">Выполнено</div>
                                  )}
                                </td>

                                {/* РК */}
                                <td className="py-2.5 px-3 text-center font-mono tabular-nums">
                                  <div className="text-[11px] text-slate-500">
                                    Норма: <strong>{line.rkPlanPct}%</strong> ({line.rkRequired} ст.)
                                  </div>
                                  <div>
                                    Факт:{' '}
                                    <strong className="text-slate-900">
                                      {line.rkCompleted}
                                    </strong>{' '}
                                    ст. ({line.rkActualPct}%)
                                    {line.rkInWork > 0 && (
                                      <span className="text-sky-700 ml-1">
                                        [в раб: {line.rkInWork}]
                                      </span>
                                    )}
                                  </div>
                                  {line.rkDeficit > 0 && (
                                    <div className="text-[11px] font-bold text-rose-700">
                                      Дефицит РК: {line.rkDeficit} ст.
                                    </div>
                                  )}
                                </td>

                                {/* УЗК */}
                                <td className="py-2.5 px-3 text-center font-mono tabular-nums">
                                  {line.uzkPlanPct === 0 ? (
                                    <span className="text-slate-400">0% (не треб.)</span>
                                  ) : (
                                    <>
                                      <div className="text-[11px] text-slate-500">
                                        Норма: <strong>{line.uzkPlanPct}%</strong> ({line.uzkRequired} ст.)
                                      </div>
                                      <div>
                                        Факт:{' '}
                                        <strong className="text-slate-900">
                                          {line.uzkCompleted}
                                        </strong>{' '}
                                        ст. ({line.uzkActualPct}%)
                                        {line.uzkInWork > 0 && (
                                          <span className="text-sky-700 ml-1">
                                            [в раб: {line.uzkInWork}]
                                          </span>
                                        )}
                                      </div>
                                      {line.uzkDeficit > 0 && (
                                        <div className="text-[11px] font-bold text-amber-800">
                                          Дефицит УЗК: {line.uzkDeficit} ст.
                                        </div>
                                      )}
                                    </>
                                  )}
                                </td>

                                {/* ПВК */}
                                <td className="py-2.5 px-3 text-center font-mono tabular-nums">
                                  {line.pvkPlanPct === 0 ? (
                                    <span className="text-slate-400">0% (не треб.)</span>
                                  ) : (
                                    <>
                                      <div className="text-[11px] text-slate-500">
                                        Норма: <strong>{line.pvkPlanPct}%</strong> ({line.pvkRequired} ст.)
                                      </div>
                                      <div>
                                        Факт:{' '}
                                        <strong className="text-slate-900">
                                          {line.pvkCompleted}
                                        </strong>{' '}
                                        ст. ({line.pvkActualPct}%)
                                      </div>
                                      {line.pvkDeficit > 0 && (
                                        <div className="text-[11px] font-bold text-amber-800">
                                          Дефицит ПВК: {line.pvkDeficit} ст.
                                        </div>
                                      )}
                                    </>
                                  )}
                                </td>

                                {/* Квота по сварщикам */}
                                <td className="py-2.5 px-3 font-mono text-[11px]">
                                  {line.welderDeficits.length === 0 ? (
                                    <span className="text-emerald-700">
                                      Квота сварщиков закрыта
                                    </span>
                                  ) : (
                                    <div className="space-y-0.5 text-amber-900">
                                      {line.welderDeficits.map((w) => (
                                        <div key={w.stamp}>
                                          Клеймо <strong>{w.stamp}</strong>: {w.controlledCount}/
                                          {w.requiredCount} (не хв. {w.deficitCount})
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>

                                {/* Статус квоты */}
                                <td className="py-2.5 px-3 text-center">
                                  {line.weldedCount === 0 ? (
                                    <span className="text-slate-400 text-[11px]">
                                      Нет сварки
                                    </span>
                                  ) : line.hasDeficit ? (
                                    <span className="text-rose-700 font-bold text-[11px]">
                                      Требуется НК (дефицит{' '}
                                      {Math.max(
                                        line.totalPhysicalDeficit,
                                        line.vikDeficit,
                                        line.inRepairCount
                                      )}{' '}
                                      ст.)
                                    </span>
                                  ) : (
                                    <span className="text-emerald-700 font-bold text-[11px]">
                                      Норматив НК выполнен
                                    </span>
                                  )}
                                </td>

                                {/* Действие инженера ПТО */}
                                <td className="py-2.5 px-3 text-right">
                                  <button
                                    type="button"
                                    disabled={line.weldedCount === 0}
                                    onClick={() => handleOpenCreateRequestModal(line)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1e3799] hover:bg-[#15276e] disabled:bg-slate-200 disabled:text-slate-400 text-white text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Сформировать заявку ({line.candidateJoints.length || line.weldedCount} ст.)</span>
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* ВКЛАДКА 2: ЖУРНАЛ ЗАЯВОК НА НК И ПРИЁМКА В РАБОТУ ДЕФЕКТОСКОПИСТОМ */}
      {/* ================================================================== */}
      {activeTab === 'requests' && (
        <div className="space-y-3">
          {/* Панель фильтрации заявок и выбора дежурного дефектоскописта */}
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'ALL', label: `Все заявки (${requestCounts.total})` },
                  { id: 'Подана ПТО', label: `Новые от ПТО (${requestCounts.submitted})` },
                  { id: 'В работе ЛНК', label: `В работе ЛНК (${requestCounts.inWork})` },
                  { id: 'Выполнена', label: `Выполнены (${requestCounts.completed})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRequestStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    requestStatusFilter === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-600">
                Дефектоскопист при приёмке в работу:
              </span>
              <select
                value={selectedInspectorForAccept}
                onChange={(e) => setSelectedInspectorForAccept(e.target.value)}
                aria-label="Дефектоскопист, принимающий заявку в работу"
                className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#1e3799]"
              >
                {inspectors.map((insp) => (
                  <option key={insp.fullName} value={insp.fullName}>
                    {insp.fullName} ({insp.certLevel})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredRequests.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3">
              <div className="text-sm font-semibold text-slate-700">
                Заявки на неразрушающий контроль по выбранному фильтру отсутствуют
              </div>
              <button
                type="button"
                onClick={() => handleOpenCreateRequestModal()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1e3799] text-white text-xs font-semibold cursor-pointer"
              >
                <FilePlus2 className="w-4 h-4" />
                <span>Создать заявку на НК от инженера ПТО</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map((req) => {
                const reqJoints = req.jointIds
                  .map((id) => jointsById.get(id))
                  .filter((j): j is WeldJoint => Boolean(j));
                const completedCount = reqJoints.filter((j) =>
                  isJointConclusionCompletedForRequest(j, req.controlStage)
                ).length;

                return (
                  <div
                    key={req.id}
                    className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden"
                  >
                    {/* Верхняя строка карточки заявки */}
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono font-bold text-sm text-[#1e3799]">
                            {req.requestNumber}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="font-semibold text-slate-800">
                            Статус: {req.status}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="font-mono text-slate-700">
                            Метод: <strong>{req.requestedMethod}</strong> ({req.controlStage})
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="font-mono text-slate-700">
                            Шифр РД: <strong>{req.rdCode}</strong> / Линия{' '}
                            <strong>{req.lineNumber}</strong>
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Подал: <strong>{req.createdBy}</strong> ({req.createdAt})
                          {req.acceptedBy && (
                            <>
                              {' '}
                              · Принял в работу ЛНК: <strong>{req.acceptedBy}</strong> (
                              {req.acceptedAt})
                            </>
                          )}
                          {req.notes && <> · Примечание: {req.notes}</>}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono tabular-nums text-slate-700 mr-1">
                          Оформлено заключений:{' '}
                          <strong>
                            {completedCount}/{reqJoints.length}
                          </strong>
                        </span>

                        {req.status === 'Подана ПТО' && (
                          <button
                            type="button"
                            onClick={() => handleAcceptRequestClick(req)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>Принять заявку в работу ЛНК</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenRequestInConclusions(req)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#1e3799] hover:bg-[#15276e] text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <ClipboardCheck className="w-3.5 h-3.5" />
                          <span>
                            {req.status === 'Выполнена'
                              ? 'Просмотреть заключения ведомости'
                              : 'Оформить заключения по стыкам'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Таблица стыков внутри заявки */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700 font-mono text-[11px] border-b border-slate-200">
                            <th className="py-2 px-3">№ стыка</th>
                            <th className="py-2 px-3">Линия</th>
                            <th className="py-2 px-3">Типоразмер D×S</th>
                            <th className="py-2 px-3">Дата сварки</th>
                            <th className="py-2 px-3">Клеймо сварщика</th>
                            <th className="py-2 px-3">Свариваемые элементы (ЛРВ)</th>
                            <th className="py-2 px-3">Акт ВИК</th>
                            <th className="py-2 px-3">Заключение НК ({req.requestedMethod})</th>
                            <th className="py-2 px-3">Дефектоскопист</th>
                            <th className="py-2 px-3 text-right">Паспорт</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {reqJoints.map((j) => {
                            const isDone = isJointConclusionCompletedForRequest(
                              j,
                              req.controlStage
                            );
                            return (
                              <tr key={j.id} className="hover:bg-slate-50">
                                <td className="py-2 px-3 font-mono font-bold text-[#1e3799]">
                                  {j.jointNumber}
                                </td>
                                <td className="py-2 px-3 font-mono text-slate-800">
                                  {j.lineNumber}
                                </td>
                                <td className="py-2 px-3 font-mono tabular-nums text-slate-700">
                                  {j.diameterMm}×{j.wallThickness} мм
                                </td>
                                <td className="py-2 px-3 font-mono tabular-nums text-slate-700">
                                  {formatDateDDMMYY(j.weldingDate)}
                                </td>
                                <td className="py-2 px-3 font-mono text-slate-800">
                                  {j.welderStamp}
                                </td>
                                <td className="py-2 px-3 text-slate-600 truncate max-w-[240px]">
                                  {j.elem1Name || j.lrv1Code} + {j.elem2Name || j.lrv2Code}
                                </td>
                                <td className="py-2 px-3 font-mono text-[11px]">
                                  <span className="font-semibold">{j.vikResult}</span>
                                  {j.vikReportNumber && (
                                    <span className="text-slate-500 ml-1">
                                      (№ {j.vikReportNumber} от {formatDateDDMMYY(j.vikDate)})
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 font-mono text-[11px]">
                                  <span
                                    className={
                                      isDone
                                        ? j.ndtResult === 'Годен'
                                          ? 'text-emerald-700 font-bold'
                                          : 'text-rose-700 font-bold'
                                        : j.ndtResult === 'В работе'
                                        ? 'text-amber-700 font-semibold'
                                        : 'text-slate-500'
                                    }
                                  >
                                    {j.ndtType}: {j.ndtResult}
                                  </span>
                                  {j.ndtReportNumber && (
                                    <span className="text-slate-600 ml-1">
                                      · № {j.ndtReportNumber} от {formatDateDDMMYY(j.ndtDate)}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-slate-700">
                                  {j.ndtInspector || j.vikInspector || '—'}
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => onOpenJointPassport(j)}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1e3799] hover:underline cursor-pointer"
                                  >
                                    <span>Паспорт</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* ВКЛАДКА 3: ОФОРМЛЕНИЕ ЗАКЛЮЧЕНИЙ НК И ВЕДОМОСТЬ РЕЗУЛЬТАТОВ        */}
      {/* ================================================================== */}
      {activeTab === 'conclusions' && (
        <div className="space-y-3">
          {/* Фильтр рабочей ведомости по Заявке / Линии / Статусу */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="w-4 h-4 text-[#1e3799]" />
                <span className="text-xs font-bold text-slate-800">
                  Выборка ведомости контроля:
                </span>

                <select
                  value={activeRequestIdForConclusions}
                  onChange={(e) => setActiveRequestIdForConclusions(e.target.value)}
                  aria-label="Выбор заявки на НК для оформления заключений"
                  className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#1e3799]"
                >
                  <option value="ALL">
                    Все сваренные стыки контура (без фильтра по заявке)
                  </option>
                  {labRequests.map((r) => (
                    <option key={r.id} value={r.id}>
                      Заявка {r.requestNumber} · Линия {r.lineNumber} ({r.requestedMethod},{' '}
                      {r.jointIds.length} ст. — {r.status})
                    </option>
                  ))}
                </select>

                {activeRequestIdForConclusions === 'ALL' && (
                  <select
                    value={conclusionLineFilter}
                    onChange={(e) => setConclusionLineFilter(e.target.value)}
                    aria-label="Фильтр ведомости по линии"
                    className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#1e3799]"
                  >
                    <option value="ALL">Все линии ({deficitStatement.allLineRows.length})</option>
                    {deficitStatement.allLineRows.map((l) => (
                      <option key={l.uniqueLineId} value={l.uniqueLineId}>
                        Линия {l.lineNumber} ({l.rdCode}) — сварено {l.weldedCount} ст.
                      </option>
                    ))}
                  </select>
                )}

                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                  {(
                    [
                      { id: 'ALL', label: 'Все стыки' },
                      { id: 'PENDING', label: 'Ожидают заключения / В работе' },
                      { id: 'COMPLETED', label: 'Заключения оформлены' },
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setConclusionStateFilter(st.id)}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        conclusionStateFilter === st.id
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {dirtyJointsCount > 0 && (
                <button
                  type="button"
                  onClick={handleSaveAllDirtyRows}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    Сохранить все изменённые заключения в ведомости ({dirtyJointsCount} ст.)
                  </span>
                </button>
              )}
            </div>

            {/* Панель быстрого пакетного присвоения номера заключения, даты и результата */}
            <div className="p-3 rounded-lg bg-[#f4f8fe] border border-sky-200/90 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-900">
                  Пакетное оформление заключения НК и ВИК{' '}
                  <span className="font-normal text-slate-600">
                    (для отмеченных галочкой стыков:{' '}
                    <strong className="font-mono">
                      {selectedConclusionJointIds.length > 0
                        ? selectedConclusionJointIds.length
                        : conclusionTargetJoints.length}
                    </strong>{' '}
                    шт.)
                  </span>
                </div>
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={batchPreset.autoIncrementNumber}
                    onChange={(e) =>
                      setBatchPreset((p) => ({
                        ...p,
                        autoIncrementNumber: e.target.checked,
                      }))
                    }
                    className="rounded border-slate-300 text-[#1e3799]"
                  />
                  <span>Автонумерация заключений по порядку (+1 для каждого стыка)</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2 items-end">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Этап контроля
                  </label>
                  <select
                    value={batchPreset.stage}
                    onChange={(e) =>
                      setBatchPreset((p) => ({
                        ...p,
                        stage: e.target.value as NdtLabControlStage,
                      }))
                    }
                    className="w-full px-2.5 py-1.5 rounded bg-white border border-slate-300 text-xs font-medium"
                  >
                    {CONTROL_STAGES_LIST.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Метод НК
                  </label>
                  <select
                    value={batchPreset.ndtMethod}
                    onChange={(e) =>
                      setBatchPreset((p) => ({
                        ...p,
                        ndtMethod: e.target.value as NdtMethod,
                      }))
                    }
                    className="w-full px-2.5 py-1.5 rounded bg-white border border-slate-300 text-xs font-mono font-semibold"
                  >
                    {NDT_METHODS_LIST.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    № заключения НК (стартовый или общий)
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={batchPreset.baseReportNumber}
                      onChange={(e) =>
                        setBatchPreset((p) => ({
                          ...p,
                          baseReportNumber: e.target.value,
                        }))
                      }
                      placeholder={suggestNextConclusionNumber(
                        joints,
                        batchPreset.ndtMethod
                      )}
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded bg-white border border-slate-300 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setBatchPreset((p) => ({
                          ...p,
                          baseReportNumber: suggestNextConclusionNumber(
                            joints,
                            p.ndtMethod
                          ),
                        }))
                      }
                      title="Сгенерировать следующий свободный номер заключения"
                      className="px-2 py-1.5 rounded bg-white border border-slate-300 hover:border-[#1e3799] text-[#1e3799] text-[11px] font-semibold cursor-pointer shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Дата заключения
                  </label>
                  <input
                    type="date"
                    value={batchPreset.ndtDate}
                    onChange={(e) =>
                      setBatchPreset((p) => ({ ...p, ndtDate: e.target.value }))
                    }
                    className="w-full px-2.5 py-1.5 rounded bg-white border border-slate-300 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Результат контроля
                  </label>
                  <select
                    value={batchPreset.ndtResult}
                    onChange={(e) =>
                      setBatchPreset((p) => ({
                        ...p,
                        ndtResult: e.target.value as ControlResult,
                      }))
                    }
                    className="w-full px-2.5 py-1.5 rounded bg-white border border-slate-300 text-xs font-bold"
                  >
                    {CONCLUSION_RESULTS_LIST.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={handleApplyBatchConclusions}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1e3799] hover:bg-[#15276e] text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <FileCheck2 className="w-3.5 h-3.5" />
                    <span>Внести в ведомость</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Рабочая таблица-ведомость выдачи заключений на каждый стык */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-mono text-[11px]">
                    <th className="py-2.5 px-2.5 w-8 text-center">
                      <input
                        type="checkbox"
                        checked={
                          conclusionTargetJoints.length > 0 &&
                          conclusionTargetJoints.every((j) =>
                            selectedConclusionJointIds.includes(j.id)
                          )
                        }
                        onChange={() => {
                          const allIds = conclusionTargetJoints.map((j) => j.id);
                          const allChecked =
                            allIds.length > 0 &&
                            allIds.every((id) =>
                              selectedConclusionJointIds.includes(id)
                            );
                          setSelectedConclusionJointIds(allChecked ? [] : allIds);
                        }}
                        aria-label="Выбрать все стыки ведомости"
                        className="rounded border-slate-400"
                      />
                    </th>
                    <th className="py-2.5 px-2.5">Линия / № стыка</th>
                    <th className="py-2.5 px-2.5">D×S / Сварка</th>
                    <th className="py-2.5 px-2.5">Акт ВИК (№, дата, итог)</th>
                    <th className="py-2.5 px-2.5">Метод НК</th>
                    <th className="py-2.5 px-2.5">№ заключения НК</th>
                    <th className="py-2.5 px-2.5">Дата заключения</th>
                    <th className="py-2.5 px-2.5">Результат НК</th>
                    <th className="py-2.5 px-2.5">Дефектоскопист ЛНК</th>
                    <th className="py-2.5 px-3 text-right">Действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {conclusionTargetJoints.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-500">
                        Нет сваренных стыков для отображения в ведомости по текущему фильтру.
                      </td>
                    </tr>
                  ) : (
                    conclusionTargetJoints.map((joint) => {
                      const row = getRowDraft(joint);
                      const isSelected = selectedConclusionJointIds.includes(joint.id);
                      const isCompleted = isJointConclusionCompletedForRequest(
                        joint,
                        row.stage
                      );

                      return (
                        <tr
                          key={joint.id}
                          className={
                            row.isDirty
                              ? 'bg-sky-50/70'
                              : isCompleted
                              ? 'bg-emerald-50/25 hover:bg-slate-50'
                              : 'bg-white hover:bg-slate-50'
                          }
                        >
                          <td className="py-2 px-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() =>
                                setSelectedConclusionJointIds((prev) =>
                                  prev.includes(joint.id)
                                    ? prev.filter((id) => id !== joint.id)
                                    : [...prev, joint.id]
                                )
                              }
                              aria-label={`Выбрать стык ${joint.jointNumber}`}
                              className="rounded border-slate-300 text-[#1e3799]"
                            />
                          </td>

                          {/* Линия и номер стыка */}
                          <td className="py-2 px-2.5">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onOpenJointPassport(joint)}
                                className="font-mono font-bold text-[#1e3799] hover:underline cursor-pointer"
                                title="Открыть полный паспорт стыка"
                              >
                                Стык № {joint.jointNumber}
                              </button>
                            </div>
                            <div className="text-[11px] font-mono text-slate-500">
                              {joint.lineNumber} · {joint.rdCode}
                            </div>
                          </td>

                          {/* D x S, дата сварки, клеймо */}
                          <td className="py-2 px-2.5 font-mono tabular-nums text-[11px]">
                            <div className="font-semibold text-slate-900">
                              {joint.diameterMm}×{joint.wallThickness} мм ({joint.weldingType})
                            </div>
                            <div className="text-slate-500">
                              Сварка: {formatDateDDMMYY(joint.weldingDate)} · Клеймо{' '}
                              <strong className="text-slate-800">{joint.welderStamp}</strong>
                            </div>
                          </td>

                          {/* Блок ВИК */}
                          <td className="py-2 px-2.5">
                            <div className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={row.includeVik}
                                onChange={(e) =>
                                  updateRowDraft(joint, {
                                    includeVik: e.target.checked,
                                  })
                                }
                                title="Оформить одновременно акт ВИК"
                                className="rounded border-slate-300 text-[#1e3799]"
                              />
                              <input
                                type="text"
                                value={row.vikReportNumber}
                                onChange={(e) =>
                                  updateRowDraft(joint, {
                                    vikReportNumber: e.target.value,
                                    includeVik: true,
                                  })
                                }
                                placeholder="№ акта ВИК"
                                className="w-24 px-2 py-1 rounded bg-white border border-slate-300 text-[11px] font-mono"
                              />
                              <select
                                value={row.vikResult}
                                onChange={(e) =>
                                  updateRowDraft(joint, {
                                    vikResult: e.target.value as ControlResult,
                                    includeVik: true,
                                  })
                                }
                                className="px-1.5 py-1 rounded bg-white border border-slate-300 text-[11px] font-semibold"
                              >
                                {CONCLUSION_RESULTS_LIST.map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>

                          {/* Метод НК */}
                          <td className="py-2 px-2.5">
                            <select
                              value={row.ndtMethod}
                              onChange={(e) =>
                                updateRowDraft(joint, {
                                  ndtMethod: e.target.value as NdtMethod,
                                })
                              }
                              aria-label={`Метод НК для стыка ${joint.jointNumber}`}
                              className="px-2 py-1 rounded bg-white border border-slate-300 text-xs font-mono font-bold text-slate-900"
                            >
                              {NDT_METHODS_LIST.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* № заключения НК */}
                          <td className="py-2 px-2.5">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={row.ndtReportNumber}
                                onChange={(e) =>
                                  updateRowDraft(joint, {
                                    ndtReportNumber: e.target.value,
                                  })
                                }
                                placeholder={suggestNextConclusionNumber(
                                  joints,
                                  row.ndtMethod
                                )}
                                aria-label={`Номер заключения НК для стыка ${joint.jointNumber}`}
                                className="w-32 px-2 py-1 rounded bg-white border border-slate-300 text-xs font-mono font-semibold text-slate-900 focus:border-[#1e3799] focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateRowDraft(joint, {
                                    ndtReportNumber: suggestNextConclusionNumber(
                                      joints,
                                      row.ndtMethod
                                    ),
                                  })
                                }
                                title="Присвоить следующий номер заключения автоматически"
                                className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-[#1e3799] cursor-pointer"
                              >
                                <Sparkles className="w-3 h-3" />
                              </button>
                            </div>
                          </td>

                          {/* Дата заключения НК */}
                          <td className="py-2 px-2.5">
                            <input
                              type="date"
                              value={row.ndtDate}
                              min={joint.weldingDate || undefined}
                              onChange={(e) =>
                                updateRowDraft(joint, { ndtDate: e.target.value })
                              }
                              aria-label={`Дата заключения НК для стыка ${joint.jointNumber}`}
                              className="px-2 py-1 rounded bg-white border border-slate-300 text-xs font-mono tabular-nums text-slate-900"
                            />
                          </td>

                          {/* Результат НК */}
                          <td className="py-2 px-2.5">
                            <select
                              value={row.ndtResult}
                              onChange={(e) =>
                                updateRowDraft(joint, {
                                  ndtResult: e.target.value as ControlResult,
                                })
                              }
                              aria-label={`Результат НК для стыка ${joint.jointNumber}`}
                              className={`px-2 py-1 rounded border text-xs font-bold ${
                                row.ndtResult === 'Годен'
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                  : row.ndtResult === 'Ремонт' ||
                                    row.ndtResult === 'Вырезать'
                                  ? 'bg-rose-50 border-rose-300 text-rose-800'
                                  : 'bg-amber-50 border-amber-300 text-amber-800'
                              }`}
                            >
                              {CONCLUSION_RESULTS_LIST.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Дефектоскопист */}
                          <td className="py-2 px-2.5">
                            <select
                              value={row.ndtInspector}
                              onChange={(e) =>
                                updateRowDraft(joint, {
                                  ndtInspector: e.target.value,
                                })
                              }
                              aria-label={`Дефектоскопист для стыка ${joint.jointNumber}`}
                              className="px-2 py-1 rounded bg-white border border-slate-300 text-xs text-slate-800 max-w-[140px]"
                            >
                              {inspectors.map((insp) => (
                                <option key={insp.fullName} value={insp.fullName}>
                                  {insp.fullName}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Кнопка сохранения заключения по стыку */}
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleCommitSingleJointConclusion(joint)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                                isCompleted && !row.isDirty
                                  ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900'
                                  : 'bg-[#1e3799] hover:bg-[#15276e] text-white'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>
                                {isCompleted && !row.isDirty
                                  ? 'Обновить заключение'
                                  : 'Выдать заключение'}
                              </span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* МОДАЛЬНОЕ ОКНО ПОДАЧИ ЗАЯВКИ НА НК ОТ ИНЖЕНЕРА ПТО                 */}
      {/* ================================================================== */}
      {requestModalState.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-label="Формирование заявки на неразрушающий контроль от инженера ПТО"
        >
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 bg-[#1e3799] text-white flex items-center justify-between">
              <div>
                <div className="text-[11px] text-sky-200 font-mono">
                  ПЕРЕДАЧА СВАРЕННЫХ СТЫКОВ В ЛАБОРАТОРИЮ НК
                </div>
                <h3
                  className="text-base font-bold"
                  style={{ fontFamily: '"Jost", sans-serif' }}
                >
                  Формирование заявки на проведение неразрушающего контроля (от ПТО)
                </h3>
              </div>
              <button
                type="button"
                onClick={() =>
                  setRequestModalState((prev) => ({ ...prev, isOpen: false }))
                }
                className="p-1 rounded-lg hover:bg-white/10 text-sky-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Выбор линии из дефицитной ведомости */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Шифр РД и технологическая линия
                  </label>
                  <select
                    value={requestModalState.lineRow?.uniqueLineId || ''}
                    onChange={(e) => {
                      const found = deficitStatement.allLineRows.find(
                        (r) => r.uniqueLineId === e.target.value
                      );
                      if (found) {
                        handleOpenCreateRequestModal(found);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 font-mono font-semibold text-slate-900"
                  >
                    {deficitStatement.allLineRows.map((r) => (
                      <option key={r.uniqueLineId} value={r.uniqueLineId}>
                        {r.rdCode} · Линия {r.lineNumber} (сварено: {r.weldedCount}, дефицит НК:{' '}
                        {r.totalPhysicalDeficit} ст.)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    ФИО инженера ПТО (заявитель)
                  </label>
                  <input
                    type="text"
                    value={requestModalState.ptoEngineerName}
                    onChange={(e) =>
                      setRequestModalState((prev) => ({
                        ...prev,
                        ptoEngineerName: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Этап неразрушающего контроля
                  </label>
                  <select
                    value={requestModalState.controlStage}
                    onChange={(e) =>
                      setRequestModalState((prev) => ({
                        ...prev,
                        controlStage: e.target.value as NdtLabControlStage,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 font-semibold text-slate-900"
                  >
                    {CONTROL_STAGES_LIST.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Запрашиваемый метод контроля
                  </label>
                  <select
                    value={requestModalState.requestedMethod}
                    onChange={(e) =>
                      setRequestModalState((prev) => ({
                        ...prev,
                        requestedMethod: e.target.value as NdtMethod,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 font-mono font-bold text-slate-900"
                  >
                    {NDT_METHODS_LIST.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Справка по нормативу выбранной линии */}
              {requestModalState.lineRow && (
                <div className="p-3 rounded-lg bg-[#f4f8fe] border border-sky-200 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
                  <span>
                    Линия <strong>{requestModalState.lineRow.lineNumber}</strong> · Контур:{' '}
                    <strong>{requestModalState.lineRow.contour}</strong>
                  </span>
                  <span>
                    Норма РК: <strong>{requestModalState.lineRow.rkPlanPct}%</strong> (дефицит{' '}
                    <strong>{requestModalState.lineRow.rkDeficit}</strong> ст.) · УЗК:{' '}
                    <strong>{requestModalState.lineRow.uzkPlanPct}%</strong> (дефицит{' '}
                    <strong>{requestModalState.lineRow.uzkDeficit}</strong> ст.) · ПВК:{' '}
                    <strong>{requestModalState.lineRow.pvkPlanPct}%</strong> (дефицит{' '}
                    <strong>{requestModalState.lineRow.pvkDeficit}</strong> ст.)
                  </span>
                </div>
              )}

              {/* Выбор сваренных стыков линии для включения в заявку */}
              {requestModalState.lineRow && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-slate-800">
                      Выберите сваренные стыки для включения в заявку (выбрано:{' '}
                      {requestModalState.selectedJointIds.length} из{' '}
                      {requestModalState.lineRow.allWeldedJoints.length}):
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const row = requestModalState.lineRow;
                          if (!row) return;
                          const pool =
                            row.candidateJoints.length > 0
                              ? row.candidateJoints
                              : row.allWeldedJoints;
                          setRequestModalState((prev) => ({
                            ...prev,
                            selectedJointIds: pool.map((j) => j.id),
                          }));
                        }}
                        className="text-[11px] font-semibold text-[#1e3799] hover:underline cursor-pointer"
                      >
                        Выбрать все неохваченные ({requestModalState.lineRow.candidateJoints.length})
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => {
                          const row = requestModalState.lineRow;
                          if (!row) return;
                          setRequestModalState((prev) => ({
                            ...prev,
                            selectedJointIds: row.allWeldedJoints.map((j) => j.id),
                          }));
                        }}
                        className="text-[11px] font-semibold text-slate-600 hover:underline cursor-pointer"
                      >
                        Выбрать все сваренные ({requestModalState.lineRow.allWeldedJoints.length})
                      </button>
                    </div>
                  </div>

                  <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {requestModalState.lineRow.allWeldedJoints.map((j) => {
                      const checked = requestModalState.selectedJointIds.includes(j.id);
                      return (
                        <label
                          key={j.id}
                          className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setRequestModalState((prev) => ({
                                  ...prev,
                                  selectedJointIds: prev.selectedJointIds.includes(j.id)
                                    ? prev.selectedJointIds.filter((id) => id !== j.id)
                                    : [...prev.selectedJointIds, j.id],
                                }))
                              }
                              className="rounded border-slate-300 text-[#1e3799]"
                            />
                            <span className="font-mono font-bold text-slate-900">
                              Стык № {j.jointNumber}
                            </span>
                            <span className="font-mono text-slate-600">
                              {j.diameterMm}×{j.wallThickness} мм · Сварка{' '}
                              {formatDateDDMMYY(j.weldingDate)} · Клеймо {j.welderStamp}
                            </span>
                          </div>
                          <span className="font-mono text-[11px] text-slate-500">
                            ВИК: {j.vikResult} | НК: {j.ndtResult}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Примечание к заявке для дефектоскопистов ЛНК
                </label>
                <input
                  type="text"
                  value={requestModalState.notes}
                  onChange={(e) =>
                    setRequestModalState((prev) => ({
                      ...prev,
                      notes: e.target.value,
                    }))
                  }
                  placeholder="Например: срочный контроль под опрессовку контура КИ-1"
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900"
                />
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setRequestModalState((prev) => ({ ...prev, isOpen: false }))
                }
                className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleSubmitNewRequest}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1e3799] hover:bg-[#15276e] text-white text-xs font-bold cursor-pointer"
              >
                <UserCheck className="w-4 h-4" />
                <span>
                  Передать заявку в Лабораторию ({requestModalState.selectedJointIds.length} ст.)
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
