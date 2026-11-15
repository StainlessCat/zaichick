import React, { useEffect, useMemo, useState } from 'react';
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
import {
  BatchPresetState,
  createDraftFromJoint,
  LabConclusionsTab,
  LabDeficitTab,
  LabHeader,
  LabJointDraftRow,
  LaboratorySubTab,
  LabRequestModal,
  LabRequestsTab,
  RequestModalState,
} from './laboratory';
import { useAuth, useAppContext } from '../context';

export type { LaboratorySubTab, LabJointDraftRow };

interface LaboratoryViewProps {
  joints?: WeldJoint[];
  lineList?: ProjectLineItem[];
  facilities?: FacilityObject[];
  inspectors: InspectorProfile[];
  currentUser?: UserAccount;
  userPermissions?: RolePermissions;
  selectedObjectName?: string;
  selectedRdCode?: string;
  onSelectObjectName?: (name: string) => void;
  onSelectRdCode?: (rd: string) => void;
  labRequests?: NdtLabRequest[];
  onCreateLabRequest: (newRequest: NdtLabRequest) => Promise<boolean> | boolean | void;
  onAcceptLabRequest: (
    requestId: string,
    inspectorName: string,
    jointUpdates: { jointId: string; patch: Partial<WeldJoint> }[]
  ) => Promise<boolean> | boolean | void;
  onSaveLabConclusions: (
    jointUpdates: { jointId: string; patch: Partial<WeldJoint> }[],
    actionSummary: string,
    relatedRequestId?: string
  ) => Promise<boolean> | boolean | void;
  onDeleteLabRequest?: (requestId: string) => Promise<boolean> | boolean | void;
  onOpenJointPassport: (joint: WeldJoint) => void;
}

export const LaboratoryView: React.FC<LaboratoryViewProps> = (props) => {
  const auth = useAuth();
  const app = useAppContext();

  const joints = props.joints ?? app.joints;
  const lineList = props.lineList ?? app.projectLineList;
  const facilities = props.facilities ?? app.derivedFacilities;
  const currentUser = props.currentUser ?? auth.currentUser;
  const userPermissions = props.userPermissions ?? auth.userPermissions;
  const selectedObjectName = props.selectedObjectName ?? app.selectedObjectName;
  const selectedRdCode = props.selectedRdCode ?? app.selectedRdCode;
  const onSelectObjectName = props.onSelectObjectName ?? app.setSelectedObjectName;
  const onSelectRdCode = props.onSelectRdCode ?? app.setSelectedRdCode;
  const labRequests = props.labRequests ?? app.labRequests;

  const {
    inspectors,
    onCreateLabRequest,
    onAcceptLabRequest,
    onSaveLabConclusions,
    onDeleteLabRequest,
    onOpenJointPassport,
  } = props;
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

  // Состояние модального конструктора новой заявки на НК от инженера ПТО
  const [requestModalState, setRequestModalState] = useState<RequestModalState>({
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

  const canCreateRequest =
    auth.isAuthenticated &&
    (userPermissions.canEditLineList ||
      userPermissions.category === 'admin' ||
      userPermissions.category === 'pto');

  const canProcessNdt =
    auth.isAuthenticated &&
    (userPermissions.canEditNdtFields ||
      userPermissions.category === 'admin' ||
      userPermissions.category === 'ndt');

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
  const handleSubmitNewRequest = async () => {
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

    const generatedId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : '';

    const newReq: NdtLabRequest = {
      id: generatedId,
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

    try {
      const ok = await Promise.resolve(onCreateLabRequest(newReq));
      if (ok !== false) {
        setRequestModalState((prev) => ({ ...prev, isOpen: false }));
        setActiveTab('requests');
        showBanner(
          'success',
          `Заявка № ${reqNumber} (${selectedJointIds.length} ст., метод ${requestedMethod}) сформирована инженером ПТО и передана в Лабораторию НК.`
        );
      } else {
        showBanner(
          'error',
          `Ошибка регистрации заявки № ${reqNumber} на сервере. Заявка не сохранена.`
        );
      }
    } catch (err: any) {
      showBanner(
        'error',
        `Сбой при регистрации заявки на сервере: ${err?.message || String(err)}`
      );
    }
  };

  // Приёмка заявки дефектоскопистом в работу
  const handleAcceptRequestClick = async (req: NdtLabRequest) => {
    const inspector = selectedInspectorForAccept.trim() || defaultInspectorName;
    const updates: { jointId: string; patch: Partial<WeldJoint> }[] = [];

    for (const jId of req.jointIds) {
      const joint = jointsById.get(jId);
      if (!joint) continue;
      const patch = buildAcceptIntoWorkJointPatch(joint, req, inspector);
      updates.push({ jointId: jId, patch });
    }

    try {
      const ok = await Promise.resolve(onAcceptLabRequest(req.id, inspector, updates));
      if (ok !== false) {
        showBanner(
          'success',
          `Заявка № ${req.requestNumber} принята в работу дефектоскопистом (${inspector}). Статус ${updates.length} стыков обновлён на «В работе» во всех разделах системы.`
        );
      } else {
        showBanner(
          'error',
          `Сервер отклонил приём заявки № ${req.requestNumber} в работу. Проверьте права доступа.`
        );
      }
    } catch (err: any) {
      showBanner(
        'error',
        `Сбой приёмки заявки на сервере: ${err?.message || String(err)}`
      );
    }
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
  const [batchPreset, setBatchPreset] = useState<BatchPresetState>({
    stage: 'Первичный ВИК и НК',
    ndtMethod: 'РК',
    baseReportNumber: '',
    autoIncrementNumber: true,
    ndtDate: new Date().toISOString().slice(0, 10),
    ndtResult: 'Годен',
    inspectorName: defaultInspectorName,
  });

  useEffect(() => {
    if (activeRequestObj) {
      setBatchPreset((prev) => ({
        ...prev,
        stage: activeRequestObj.controlStage,
        ndtMethod: activeRequestObj.requestedMethod,
        inspectorName: activeRequestObj.acceptedBy || defaultInspectorName,
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
      vikReportNumber: row.includeVik ? row.vikReportNumber.trim() : '',
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

    Promise.resolve(
      onSaveLabConclusions(
        [{ jointId: joint.id, patch: res.patch }],
        `Оформлено заключение НК № ${reportNumToUse} (${input.ndtMethod}: ${input.ndtResult}) по стыку № ${joint.jointNumber}`,
        activeRequestObj?.id
      )
    )
      .then((ok) => {
        if (ok !== false) {
          setDraftRows((prev) => {
            const next = { ...prev };
            delete next[joint.id];
            return next;
          });
          showBanner(
            'success',
            `Заключение № ${reportNumToUse} (${input.ndtMethod} — «${input.ndtResult}») по стыку № ${joint.jointNumber} внесено в ведомость и синхронизировано во всех разделах программы.`
          );
        } else {
          showBanner(
            'error',
            `Сервер отклонил сохранение заключения по стыку № ${joint.jointNumber}. Проверьте подключение и ревизию стыка.`
          );
        }
      })
      .catch(() => {
        showBanner(
          'error',
          `Сетевая ошибка при отправке заключения по стыку № ${joint.jointNumber} на сервер.`
        );
      });
  };

  // Пакетное применение и сохранение заключений по выбранным стыкам ведомости
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
        includeVik: batchPreset.stage === 'Первичный ВИК и НК',
        vikReportNumber: '',
        vikDate: effectiveDate,
        vikResult:
          batchPreset.ndtResult === 'Годен' ? 'Годен' : batchPreset.ndtResult,
        vikInspector: batchPreset.inspectorName || defaultInspectorName,
        ndtMethod: batchPreset.ndtMethod,
        ndtReportNumber: reportNumber,
        ndtDate: effectiveDate,
        ndtResult: batchPreset.ndtResult,
        ndtInspector: batchPreset.inspectorName || defaultInspectorName,
      };

      const built = buildLabConclusionPatch(joint, input);
      if (!built.ok) {
        showBanner('error', built.error || 'Ошибка пакетного оформления заключений.');
        return;
      }
      updates.push({ jointId: joint.id, patch: built.patch });
    }

    Promise.resolve(
      onSaveLabConclusions(
        updates,
        `Пакетное оформление заключений ЛНК (${updates.length} ст., метод ${batchPreset.ndtMethod}, результат «${batchPreset.ndtResult}»)`,
        activeRequestObj?.id
      )
    )
      .then((ok) => {
        if (ok !== false) {
          setDraftRows({});
          setSelectedConclusionJointIds([]);
          showBanner(
            'success',
            `Оформлено и внесено в ведомость ${updates.length} заключений НК (${batchPreset.ndtMethod} — «${batchPreset.ndtResult}»). Данные обновлены в Реестре, Лайнлисте, Журналах и Сводке готовности.`
          );
        } else {
          showBanner(
            'error',
            'Сервер отклонил сохранение пакета заключений. Данные на сервере не обновлены.'
          );
        }
      })
      .catch(() => {
        showBanner(
          'error',
          'Сетевая ошибка при передаче пакета заключений на сервер.'
        );
      });
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
        vikReportNumber: row.includeVik ? row.vikReportNumber.trim() : '',
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

    Promise.resolve(
      onSaveLabConclusions(
        updates,
        `Сохранение ведомости заключений ЛНК (${updates.length} ст.)`,
        activeRequestObj?.id
      )
    )
      .then((ok) => {
        if (ok !== false) {
          setDraftRows({});
          showBanner(
            'success',
            `Сохранено ${updates.length} заключений в ведомости Лаборатории НК. Результаты синхронизированы со всеми разделами.`
          );
        } else {
          showBanner(
            'error',
            'Сервер отклонил сохранение отредактированных строк ведомости. Проверьте соединение.'
          );
        }
      })
      .catch(() => {
        showBanner(
          'error',
          'Сетевая ошибка при отправке отредактированных строк на сервер.'
        );
      });
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
      {/* Шапка раздела и сводная статистика */}
      <LabHeader
        selectedObjectName={selectedObjectName}
        selectedRdCode={selectedRdCode}
        onSelectRdCode={onSelectRdCode}
        availableRdCodes={availableRdCodes}
        onExportDeficitCsv={handleExportDeficitCsv}
        deficitStatement={deficitStatement}
        requestCounts={requestCounts}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        conclusionsCount={conclusionTargetJoints.length}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        statusBanner={statusBanner}
        onDismissStatusBanner={() => setStatusBanner(null)}
      />

      {/* Вкладка 1: Дефицитная ведомость */}
      {activeTab === 'deficit' && (
        <LabDeficitTab
          onlyDeficitLines={onlyDeficitLines}
          setOnlyDeficitLines={setOnlyDeficitLines}
          filteredRdGroups={filteredRdGroups}
          expandedRdCodes={expandedRdCodes}
          setExpandedRdCodes={setExpandedRdCodes}
          onOpenCreateRequestModal={handleOpenCreateRequestModal}
          canCreateRequest={canCreateRequest}
        />
      )}

      {/* Вкладка 2: Реестр заявок от инженера ПТО */}
      {activeTab === 'requests' && (
        <LabRequestsTab
          filteredRequests={filteredRequests}
          requestCounts={requestCounts}
          requestStatusFilter={requestStatusFilter}
          setRequestStatusFilter={setRequestStatusFilter}
          selectedInspectorForAccept={selectedInspectorForAccept}
          setSelectedInspectorForAccept={setSelectedInspectorForAccept}
          inspectors={inspectors}
          jointsById={jointsById}
          canDeleteRequest={userPermissions.category === 'admin' || userPermissions.canEditLineList}
          canAcceptRequest={canProcessNdt}
          onOpenCreateRequestModal={() => handleOpenCreateRequestModal()}
          onAcceptRequestClick={handleAcceptRequestClick}
          onDeleteRequestClick={
            onDeleteLabRequest
              ? (req) => {
                  if (
                    window.confirm(
                      `Вы уверены, что хотите удалить заявку № ${req.requestNumber}?`
                    )
                  ) {
                    Promise.resolve(onDeleteLabRequest(req.id))
                      .then((ok) => {
                        if (ok !== false) {
                          showBanner(
                            'success',
                            `Заявка № ${req.requestNumber} успешно удалена.`
                          );
                        } else {
                          showBanner(
                            'error',
                            `Ошибка при удалении заявки № ${req.requestNumber}.`
                          );
                        }
                      })
                      .catch(() => {
                        showBanner(
                          'error',
                          `Сетевая ошибка при удалении заявки № ${req.requestNumber}.`
                        );
                      });
                  }
                }
              : undefined
          }
          onOpenRequestInConclusions={handleOpenRequestInConclusions}
          onOpenJointPassport={onOpenJointPassport}
        />
      )}

      {/* Вкладка 3: Оформление и выдача заключений НК */}
      {activeTab === 'conclusions' && (
        <LabConclusionsTab
          activeRequestIdForConclusions={activeRequestIdForConclusions}
          setActiveRequestIdForConclusions={setActiveRequestIdForConclusions}
          conclusionLineFilter={conclusionLineFilter}
          setConclusionLineFilter={setConclusionLineFilter}
          conclusionStateFilter={conclusionStateFilter}
          setConclusionStateFilter={setConclusionStateFilter}
          labRequests={labRequests}
          deficitAllLineRows={deficitStatement.allLineRows}
          dirtyJointsCount={dirtyJointsCount}
          onSaveAllDirtyRows={handleSaveAllDirtyRows}
          batchPreset={batchPreset}
          setBatchPreset={setBatchPreset}
          onApplyBatchConclusions={handleApplyBatchConclusions}
          conclusionTargetJoints={conclusionTargetJoints}
          selectedConclusionJointIds={selectedConclusionJointIds}
          setSelectedConclusionJointIds={setSelectedConclusionJointIds}
          getRowDraft={getRowDraft}
          updateRowDraft={updateRowDraft}
          onCommitSingleJointConclusion={handleCommitSingleJointConclusion}
          onOpenJointPassport={onOpenJointPassport}
          inspectors={inspectors}
          joints={joints}
          canProcessNdt={canProcessNdt}
        />
      )}

      {/* Модальное окно создания заявки от ПТО */}
      <LabRequestModal
        isOpen={requestModalState.isOpen}
        requestModalState={requestModalState}
        setRequestModalState={setRequestModalState}
        deficitStatement={deficitStatement}
        onOpenCreateRequestModal={handleOpenCreateRequestModal}
        onSubmitNewRequest={handleSubmitNewRequest}
        onClose={() => setRequestModalState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
