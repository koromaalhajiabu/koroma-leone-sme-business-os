(() => {
'use strict';
const URL='https://nclncqlgnxnijlumznnt.supabase.co';
const KEY='sb_publishable_iPIsAysPnlvPCAoqntoNRg_dKcSZxKX';
const $=id=>document.getElementById(id);
const client=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let session=null,application=null;
const words={
en:{kicker:'CUSTOMER ONBOARDING',title:'Apply for your business workspace',intro:'Tell us about your business. After review and approval, Koroma Leone Tech will securely create your workspace under your own account, configure the recommended modules and prepare your Main Branch.',authTitle:'Sign in to continue',authIntro:'Use the account you created on the main platform. Your email must be confirmed before you can submit an application.',email:'Account email',password:'Password',signIn:'Sign in securely',createAccount:'Create an account first',formTitle:'Business application',formIntro:'Submit accurate details. The developer reviews this application before any workspace is created.',fullName:'Owner / authorised representative full name *',personalPhone:'Applicant phone number *',businessName:'Business / organisation name *',industry:'Industry *',businessType:'Specific business type *',currency:'Default currency *',businessEmail:'Business contact email',businessPhone:'Business contact phone',country:'Country *',address:'Business address',website:'Website (optional)',tax:'Tax / business registration number',notes:'Additional information',notice:'Submitting this form does not create a workspace immediately. Your account must have a confirmed email, and the developer must review the application. Never share your password or verification code.',submit:'Submit business application',return:'Return to platform',signedIn:'Signed in. Complete the business application below.',pending:'Your business application has been submitted and is awaiting developer review.',needs_information:'The developer requested more information. Update the form and submit it again.',rejected:'Your previous application was not approved. You may revise the details and submit again.',approved:'Your business has been approved and its workspace has been created. Sign in to open it.',loginRequired:'Sign in with the account you created on the main platform.',error:'Could not complete the request: '},
fr:{kicker:'INSCRIPTION CLIENT',title:'Demander votre espace professionnel',intro:'Présentez votre entreprise. Après examen et approbation, Koroma Leone Tech créera votre espace sous votre propre compte.',authTitle:'Connectez-vous pour continuer',authIntro:'Utilisez le compte créé sur la plateforme principale. Votre adresse e-mail doit être confirmée.',email:'Adresse e-mail du compte',password:'Mot de passe',signIn:'Connexion sécurisée',createAccount:'Créer un compte d’abord',formTitle:'Demande d’entreprise',formIntro:'Fournissez des informations exactes. Le développeur examinera la demande avant de créer un espace.',fullName:'Nom complet du propriétaire / représentant *',personalPhone:'Téléphone du demandeur *',businessName:'Nom de l’entreprise / organisation *',industry:'Secteur *',businessType:'Type précis d’activité *',currency:'Devise par défaut *',businessEmail:'E-mail professionnel',businessPhone:'Téléphone professionnel',country:'Pays *',address:'Adresse professionnelle',website:'Site web (facultatif)',tax:'Numéro fiscal / immatriculation',notes:'Informations complémentaires',notice:'L’envoi ne crée pas immédiatement un espace. Votre e-mail doit être confirmé et le développeur doit examiner la demande. Ne partagez jamais votre mot de passe.',submit:'Envoyer la demande',return:'Retour à la plateforme',signedIn:'Connecté. Complétez la demande ci-dessous.',pending:'Votre demande a été envoyée et attend son examen.',needs_information:'Le développeur demande des informations complémentaires. Modifiez puis renvoyez le formulaire.',rejected:'La demande précédente n’a pas été approuvée. Vous pouvez la modifier et la renvoyer.',approved:'Votre entreprise est approuvée et son espace est créé. Connectez-vous à la plateforme.',loginRequired:'Connectez-vous avec votre compte de la plateforme principale.',error:'La demande a échoué : '},
es:{kicker:'REGISTRO DE CLIENTES',title:'Solicite tu espacio empresarial',intro:'Cuéntanos sobre tu empresa. Tras la revisión y aprobación, Koroma Leone Tech creará tu espacio bajo tu propia cuenta.',authTitle:'Inicia sesión para continuar',authIntro:'Usa la cuenta creada en la plataforma principal. Tu correo debe estar confirmado.',email:'Correo de la cuenta',password:'Contraseña',signIn:'Iniciar sesión de forma segura',createAccount:'Crea una cuenta primero',formTitle:'Solicitud empresarial',formIntro:'Envía datos correctos. El desarrollador revisará la solicitud antes de crear el espacio.',fullName:'Nombre del propietario / representante *',personalPhone:'Teléfono del solicitante *',businessName:'Nombre de empresa / organización *',industry:'Sector *',businessType:'Tipo específico de negocio *',currency:'Moneda predeterminada *',businessEmail:'Correo empresarial',businessPhone:'Teléfono empresarial',country:'País *',address:'Dirección del negocio',website:'Sitio web (opcional)',tax:'Número fiscal / registro',notes:'Información adicional',notice:'Enviar este formulario no crea un espacio inmediatamente. El correo debe estar confirmado y el desarrollador debe revisar la solicitud. Nunca compartas tu contraseña.',submit:'Enviar solicitud',return:'Volver a la plataforma',signedIn:'Sesión iniciada. Completa la solicitud.',pending:'La solicitud se ha enviado y está pendiente de revisión.',needs_information:'El desarrollador solicita más información. Actualiza y vuelve a enviar el formulario.',rejected:'La solicitud anterior no fue aprobada. Puedes corregirla y enviarla de nuevo.',approved:'La empresa ha sido aprobada y el espacio está creado. Inicia sesión para abrirlo.',loginRequired:'Inicia sesión con la cuenta de la plataforma principal.',error:'No se pudo completar: '},
ar:{kicker:'تسجيل العملاء',title:'قدّم طلب مساحة عمل لشركتك',intro:'أخبرنا عن نشاطك. بعد المراجعة والموافقة، ستنشئ Koroma Leone Tech مساحة العمل ضمن حسابك.',authTitle:'سجّل الدخول للمتابعة',authIntro:'استخدم الحساب الذي أنشأته في المنصة الرئيسية. يجب تأكيد بريدك الإلكتروني.',email:'البريد الإلكتروني للحساب',password:'كلمة المرور',signIn:'تسجيل دخول آمن',createAccount:'أنشئ حساباً أولاً',formTitle:'طلب تسجيل النشاط',formIntro:'قدّم بيانات دقيقة. سيراجع المطور الطلب قبل إنشاء مساحة العمل.',fullName:'الاسم الكامل للمالك / الممثل *',personalPhone:'هاتف مقدم الطلب *',businessName:'اسم النشاط / المؤسسة *',industry:'القطاع *',businessType:'نوع النشاط المحدد *',currency:'العملة الافتراضية *',businessEmail:'بريد النشاط',businessPhone:'هاتف النشاط',country:'الدولة *',address:'عنوان النشاط',website:'الموقع الإلكتروني (اختياري)',tax:'الرقم الضريبي / التسجيل',notes:'معلومات إضافية',notice:'إرسال النموذج لا ينشئ مساحة العمل فوراً. يجب تأكيد البريد ومراجعة المطور للطلب. لا تشارك كلمة المرور أبداً.',submit:'إرسال الطلب',return:'العودة إلى المنصة',signedIn:'تم تسجيل الدخول. أكمل الطلب أدناه.',pending:'تم إرسال طلبك وهو بانتظار المراجعة.',needs_information:'طلب المطور معلومات إضافية. حدّث النموذج وأعد إرساله.',rejected:'لم تتم الموافقة على الطلب السابق. يمكنك تعديله وإعادة إرساله.',approved:'تمت الموافقة على نشاطك وإنشاء مساحة العمل. سجّل الدخول لفتحها.',loginRequired:'سجّل الدخول باستخدام حساب المنصة الرئيسية.',error:'تعذر إكمال الطلب: '},
hi:{kicker:'ग्राहक पंजीकरण',title:'अपने व्यवसाय कार्यक्षेत्र के लिए आवेदन करें',intro:'अपने व्यवसाय का विवरण दें। समीक्षा और स्वीकृति के बाद Koroma Leone Tech आपके खाते के अंतर्गत कार्यक्षेत्र बनाएगा।',authTitle:'जारी रखने के लिए साइन इन करें',authIntro:'मुख्य प्लेटफ़ॉर्म पर बनाया गया खाता उपयोग करें। ईमेल सत्यापित होना चाहिए।',email:'खाता ईमेल',password:'पासवर्ड',signIn:'सुरक्षित साइन इन',createAccount:'पहले खाता बनाएँ',formTitle:'व्यवसाय आवेदन',formIntro:'सही जानकारी दें। कार्यक्षेत्र बनने से पहले डेवलपर आवेदन की समीक्षा करेगा।',fullName:'मालिक / अधिकृत प्रतिनिधि का पूरा नाम *',personalPhone:'आवेदक का फोन *',businessName:'व्यवसाय / संगठन का नाम *',industry:'उद्योग *',businessType:'व्यवसाय का विशिष्ट प्रकार *',currency:'डिफ़ॉल्ट मुद्रा *',businessEmail:'व्यवसाय ईमेल',businessPhone:'व्यवसाय फोन',country:'देश *',address:'व्यवसाय का पता',website:'वेबसाइट (वैकल्पिक)',tax:'कर / पंजीकरण संख्या',notes:'अतिरिक्त जानकारी',notice:'फॉर्म जमा करने से तुरंत कार्यक्षेत्र नहीं बनता। ईमेल सत्यापित होना चाहिए और डेवलपर को आवेदन की समीक्षा करनी होगी। पासवर्ड साझा न करें।',submit:'व्यवसाय आवेदन जमा करें',return:'प्लेटफ़ॉर्म पर लौटें',signedIn:'साइन इन हो गया। नीचे आवेदन पूरा करें।',pending:'आपका आवेदन जमा हो गया है और समीक्षा की प्रतीक्षा में है।',needs_information:'डेवलपर ने अतिरिक्त जानकारी मांगी है। फॉर्म अपडेट करके फिर जमा करें।',rejected:'पिछला आवेदन स्वीकृत नहीं हुआ। आप विवरण बदलकर फिर जमा कर सकते हैं।',approved:'व्यवसाय स्वीकृत है और कार्यक्षेत्र बन गया है। इसे खोलने के लिए साइन इन करें।',loginRequired:'मुख्य प्लेटफ़ॉर्म खाते से साइन इन करें।',error:'अनुरोध पूरा नहीं हुआ: '},
zh:{kicker:'客户注册',title:'申请您的企业工作区',intro:'请提供企业信息。审核通过后，Koroma Leone Tech 将在您的账户下安全创建工作区。',authTitle:'登录后继续',authIntro:'使用您在主平台创建的账户。提交申请前必须验证邮箱。',email:'账户邮箱',password:'密码',signIn:'安全登录',createAccount:'先创建账户',formTitle:'企业申请',formIntro:'请提供准确资料。开发者审核后才会创建工作区。',fullName:'业主 / 授权代表姓名 *',personalPhone:'申请人电话 *',businessName:'企业 / 组织名称 *',industry:'行业 *',businessType:'具体业务类型 *',currency:'默认货币 *',businessEmail:'企业联系邮箱',businessPhone:'企业联系电话',country:'国家 *',address:'企业地址',website:'网站（可选）',tax:'税务 / 注册号码',notes:'补充信息',notice:'提交表格不会立即创建工作区。必须先验证邮箱并由开发者审核。请勿分享密码或验证码。',submit:'提交企业申请',return:'返回平台',signedIn:'已登录。请完成下面的申请。',pending:'申请已提交，等待开发者审核。',needs_information:'开发者需要更多资料。请更新表格后重新提交。',rejected:'之前的申请未获批准。您可以修改后重新提交。',approved:'企业已获批准并创建工作区。请登录打开。',loginRequired:'请使用主平台账户登录。',error:'无法完成请求： '}
};

const extraWords={
en:{applicationType:'What are you registering? *',businessWorkspace:'Business workspace',footballClubWorkspace:'Football club workspace',clubDetailsTitle:'Football club details',clubDetailsIntro:'These details are reviewed with your business application. The same account will own the approved club workspace.',officialClubName:'Official club name *',shortName:'Short name',clubType:'Club category *',mens:"Men's team",womens:"Women's team",academy:'Academy',other:'Other',district:'District / region',city:'City / town',competition:'League / competition',homeGround:'Home ground',registrationBody:'Registration body',registrationNumber:'Club registration number',managerName:'Manager / authorised representative *',managerRole:'Position at the club *',websiteSlug:'Preferred public website address *',authority:'Explain your authority to represent this club *',evidence:'Supporting evidence (PDF or image, maximum 10 MB)',evidenceRef:'Evidence reference or document title',declaration:'I confirm that the information is accurate and that I am authorised to apply on behalf of this club.',submitClub:'Submit football club application',pendingClub:'Your football club application has been submitted and is awaiting developer review.'},
fr:{applicationType:'Que souhaitez-vous enregistrer ? *',businessWorkspace:'Espace professionnel',footballClubWorkspace:'Espace de club de football',clubDetailsTitle:'Informations sur le club de football',clubDetailsIntro:'Ces informations sont examinées avec votre demande professionnelle. Le même compte sera propriétaire de l’espace du club approuvé.',officialClubName:'Nom officiel du club *',shortName:'Nom abrégé',clubType:'Catégorie du club *',mens:'Équipe masculine',womens:'Équipe féminine',academy:'Académie',other:'Autre',district:'District / région',city:'Ville',competition:'Ligue / compétition',homeGround:'Terrain à domicile',registrationBody:'Organisme d’enregistrement',registrationNumber:'Numéro d’enregistrement du club',managerName:'Responsable / représentant autorisé *',managerRole:'Fonction au sein du club *',websiteSlug:'Adresse publique souhaitée du site *',authority:'Expliquez votre autorité à représenter ce club *',evidence:'Justificatif (PDF ou image, 10 Mo maximum)',evidenceRef:'Référence ou titre du justificatif',declaration:'Je confirme que les informations sont exactes et que je suis autorisé à déposer cette demande au nom du club.',submitClub:'Envoyer la demande du club',pendingClub:'La demande de votre club de football a été envoyée et attend son examen.'},
es:{applicationType:'¿Qué desea registrar? *',businessWorkspace:'Espacio empresarial',footballClubWorkspace:'Espacio de club de fútbol',clubDetailsTitle:'Datos del club de fútbol',clubDetailsIntro:'Estos datos se revisan junto con la solicitud empresarial. La misma cuenta será propietaria del espacio del club aprobado.',officialClubName:'Nombre oficial del club *',shortName:'Nombre corto',clubType:'Categoría del club *',mens:'Equipo masculino',womens:'Equipo femenino',academy:'Academia',other:'Otro',district:'Distrito / región',city:'Ciudad / localidad',competition:'Liga / competición',homeGround:'Campo local',registrationBody:'Entidad de registro',registrationNumber:'Número de registro del club',managerName:'Gerente / representante autorizado *',managerRole:'Cargo en el club *',websiteSlug:'Dirección pública preferida del sitio web *',authority:'Explique su autoridad para representar al club *',evidence:'Documento de respaldo (PDF o imagen, máximo 10 MB)',evidenceRef:'Referencia o título del documento',declaration:'Confirmo que la información es correcta y que estoy autorizado para presentar esta solicitud en nombre del club.',submitClub:'Enviar solicitud del club',pendingClub:'La solicitud del club de fútbol se ha enviado y espera la revisión del desarrollador.'},
ar:{applicationType:'ما نوع التسجيل الذي تريده؟ *',businessWorkspace:'مساحة عمل تجارية',footballClubWorkspace:'مساحة نادي كرة قدم',clubDetailsTitle:'تفاصيل نادي كرة القدم',clubDetailsIntro:'ستتم مراجعة هذه التفاصيل مع طلب النشاط التجاري. سيملك الحساب نفسه مساحة النادي بعد الموافقة.',officialClubName:'الاسم الرسمي للنادي *',shortName:'الاسم المختصر',clubType:'فئة النادي *',mens:'فريق رجال',womens:'فريق نساء',academy:'أكاديمية',other:'أخرى',district:'المنطقة / الإقليم',city:'المدينة / البلدة',competition:'الدوري / المنافسة',homeGround:'الملعب الرئيسي',registrationBody:'جهة التسجيل',registrationNumber:'رقم تسجيل النادي',managerName:'المدير / الممثل المفوض *',managerRole:'المنصب في النادي *',websiteSlug:'عنوان الموقع العام المفضل *',authority:'اشرح صلاحيتك لتمثيل هذا النادي *',evidence:'مستند داعم (PDF أو صورة، بحد أقصى 10 ميغابايت)',evidenceRef:'مرجع المستند أو عنوانه',declaration:'أؤكد صحة المعلومات وأنني مخول بتقديم هذا الطلب نيابة عن النادي.',submitClub:'إرسال طلب نادي كرة القدم',pendingClub:'تم إرسال طلب نادي كرة القدم وينتظر مراجعة المطور.'},
hi:{applicationType:'आप क्या पंजीकृत करना चाहते हैं? *',businessWorkspace:'व्यवसाय कार्यक्षेत्र',footballClubWorkspace:'फुटबॉल क्लब कार्यक्षेत्र',clubDetailsTitle:'फुटबॉल क्लब का विवरण',clubDetailsIntro:'इन विवरणों की समीक्षा आपके व्यवसाय आवेदन के साथ की जाएगी। स्वीकृत क्लब कार्यक्षेत्र का स्वामी यही खाता होगा।',officialClubName:'क्लब का आधिकारिक नाम *',shortName:'संक्षिप्त नाम',clubType:'क्लब श्रेणी *',mens:'पुरुष टीम',womens:'महिला टीम',academy:'अकादमी',other:'अन्य',district:'जिला / क्षेत्र',city:'शहर / कस्बा',competition:'लीग / प्रतियोगिता',homeGround:'घरेलू मैदान',registrationBody:'पंजीकरण संस्था',registrationNumber:'क्लब पंजीकरण संख्या',managerName:'प्रबंधक / अधिकृत प्रतिनिधि *',managerRole:'क्लब में पद *',websiteSlug:'पसंदीदा सार्वजनिक वेबसाइट पता *',authority:'क्लब का प्रतिनिधित्व करने का अपना अधिकार समझाएँ *',evidence:'सहायक प्रमाण (PDF या छवि, अधिकतम 10 MB)',evidenceRef:'प्रमाण संदर्भ या दस्तावेज़ शीर्षक',declaration:'मैं पुष्टि करता/करती हूँ कि जानकारी सही है और मुझे क्लब की ओर से आवेदन करने का अधिकार है।',submitClub:'फुटबॉल क्लब आवेदन जमा करें',pendingClub:'फुटबॉल क्लब आवेदन जमा हो गया है और डेवलपर समीक्षा की प्रतीक्षा में है।'},
zh:{applicationType:'您要注册哪种工作区？*',businessWorkspace:'企业工作区',footballClubWorkspace:'足球俱乐部工作区',clubDetailsTitle:'足球俱乐部资料',clubDetailsIntro:'这些资料将与企业申请一并审核。获批后的俱乐部工作区由同一账户拥有。',officialClubName:'俱乐部官方名称 *',shortName:'简称',clubType:'俱乐部类别 *',mens:'男子队',womens:'女子队',academy:'青训学院',other:'其他',district:'区 / 地区',city:'城市 / 城镇',competition:'联赛 / 赛事',homeGround:'主场',registrationBody:'注册机构',registrationNumber:'俱乐部注册编号',managerName:'经理 / 授权代表 *',managerRole:'俱乐部职务 *',websiteSlug:'首选公开网站地址 *',authority:'说明您代表该俱乐部的授权依据 *',evidence:'证明材料（PDF 或图片，最大 10 MB）',evidenceRef:'证明材料编号或标题',declaration:'我确认所填信息准确，并已获授权代表该俱乐部提交申请。',submitClub:'提交足球俱乐部申请',pendingClub:'足球俱乐部申请已提交，等待开发者审核。'}
};
extraWords.en.businessTypePlaceholder='e.g. Building materials supplier';extraWords.en.clubWebsiteSlugPlaceholder='example-united-fc';extraWords.en.websiteUrlPlaceholder='https://';extraWords.en.industrySports='Sports and local league management';extraWords.en.footballClubType='Football club';
extraWords.fr.businessTypePlaceholder='ex. fournisseur de matériaux de construction';extraWords.fr.clubWebsiteSlugPlaceholder='exemple-united-fc';extraWords.fr.websiteUrlPlaceholder='https://';extraWords.fr.industrySports='Sports et gestion des ligues locales';extraWords.fr.footballClubType='Club de football';
extraWords.es.businessTypePlaceholder='p. ej. proveedor de materiales de construcción';extraWords.es.clubWebsiteSlugPlaceholder='ejemplo-united-fc';extraWords.es.websiteUrlPlaceholder='https://';extraWords.es.industrySports='Deportes y gestión de ligas locales';extraWords.es.footballClubType='Club de fútbol';
extraWords.ar.businessTypePlaceholder='مثال: مورد مواد البناء';extraWords.ar.clubWebsiteSlugPlaceholder='نموذج-نادي-الاتحاد';extraWords.ar.websiteUrlPlaceholder='https://';extraWords.ar.industrySports='الرياضة وإدارة الدوريات المحلية';extraWords.ar.footballClubType='نادي كرة قدم';
extraWords.hi.businessTypePlaceholder='उदाहरण: निर्माण सामग्री आपूर्तिकर्ता';extraWords.hi.clubWebsiteSlugPlaceholder='example-united-fc';extraWords.hi.websiteUrlPlaceholder='https://';extraWords.hi.industrySports='खेल और स्थानीय लीग प्रबंधन';extraWords.hi.footballClubType='फुटबॉल क्लब';
extraWords.zh.businessTypePlaceholder='例如：建筑材料供应商';extraWords.zh.clubWebsiteSlugPlaceholder='示例-united-fc';extraWords.zh.websiteUrlPlaceholder='https://';extraWords.zh.industrySports='体育与本地联赛管理';extraWords.zh.footballClubType='足球俱乐部';

Object.assign(extraWords.en,{
  chooseIndustry:'Choose an industry',chooseBusinessType:'Choose a business type',
  businessTypeSearchLabel:'Search all 111 supported business types',
  businessTypeSearchPlaceholder:'Type a business name to find it',
  businessTypeSearchHint:'All available business types are grouped by industry. Choosing a type also selects its industry.',
  businessTypeHint:'111 supported business types are available, plus a custom option.',
  businessTypeCustom:'Enter your business type *',customBusinessTypePlaceholder:'Type your business',
  customBusinessTypeOption:'My business type is not listed — enter it',
  customBusinessTypeGroup:'Other business type',
  industryRetail:'Retail and trading',industryFood:'Food, hospitality and entertainment',
  industryHospitals:'Hospitals and healthcare facilities',industryHealthcare:'Healthcare and pharmaceutical',
  industryAutomotive:'Automotive and transport',industryConstruction:'Construction and industrial',
  industryProfessional:'Professional and personal services',industryEducation:'Education and training',
  industryAgriculture:'Agriculture and fisheries',industryProperty:'Property and rental',
  industryFinancial:'Financial and administrative services',industrySports:'Sports and local league management',
  industryGeneral:'General and multi-industry'
});
Object.assign(extraWords.fr,{
  chooseIndustry:'Choisissez un secteur',chooseBusinessType:'Choisissez un type d’activité',
  businessTypeSearchLabel:'Rechercher parmi les 111 types d’entreprise',
  businessTypeSearchPlaceholder:'Saisissez un nom d’activité pour le trouver',
  businessTypeSearchHint:'Tous les types sont regroupés par secteur. Le choix d’un type sélectionne aussi son secteur.',
  businessTypeHint:'111 types d’entreprise sont disponibles, avec une option personnalisée.',
  businessTypeCustom:'Précisez votre type d’activité *',customBusinessTypePlaceholder:'Saisissez votre activité',
  customBusinessTypeOption:'Mon activité n’est pas répertoriée — la saisir',
  customBusinessTypeGroup:'Autre type d’activité',
  industryRetail:'Commerce de détail et négoce',industryFood:'Restauration, hôtellerie et divertissement',
  industryHospitals:'Hôpitaux et établissements de santé',industryHealthcare:'Santé et pharmacie',
  industryAutomotive:'Automobile et transport',industryConstruction:'Construction et industrie',
  industryProfessional:'Services professionnels et personnels',industryEducation:'Éducation et formation',
  industryAgriculture:'Agriculture et pêche',industryProperty:'Immobilier et location',
  industryFinancial:'Services financiers et administratifs',industrySports:'Sport et gestion des ligues locales',
  industryGeneral:'Activités générales et multisectorielles'
});
Object.assign(extraWords.es,{
  chooseIndustry:'Elige un sector',chooseBusinessType:'Elige un tipo de negocio',
  businessTypeSearchLabel:'Buscar entre los 111 tipos de negocio disponibles',
  businessTypeSearchPlaceholder:'Escribe el nombre de un negocio',
  businessTypeSearchHint:'Todos los tipos están agrupados por sector. Al elegir un tipo también se selecciona su sector.',
  businessTypeHint:'Hay 111 tipos de negocio disponibles y una opción personalizada.',
  businessTypeCustom:'Especifica tu tipo de negocio *',customBusinessTypePlaceholder:'Escribe tu negocio',
  customBusinessTypeOption:'Mi negocio no aparece — escribirlo',
  customBusinessTypeGroup:'Otro tipo de negocio',
  industryRetail:'Comercio minorista y distribución',industryFood:'Alimentación, hostelería y entretenimiento',
  industryHospitals:'Hospitales y centros sanitarios',industryHealthcare:'Salud y productos farmacéuticos',
  industryAutomotive:'Automoción y transporte',industryConstruction:'Construcción e industria',
  industryProfessional:'Servicios profesionales y personales',industryEducation:'Educación y formación',
  industryAgriculture:'Agricultura y pesca',industryProperty:'Inmobiliaria y alquiler',
  industryFinancial:'Servicios financieros y administrativos',industrySports:'Deportes y gestión de ligas locales',
  industryGeneral:'Negocios generales y multisectoriales'
});
Object.assign(extraWords.ar,{
  chooseIndustry:'اختر قطاعًا',chooseBusinessType:'اختر نوع النشاط التجاري',
  businessTypeSearchLabel:'ابحث في جميع أنواع الأنشطة التجارية الـ111',
  businessTypeSearchPlaceholder:'اكتب اسم النشاط للبحث عنه',
  businessTypeSearchHint:'جميع الأنشطة مصنفة حسب القطاع. اختيار النشاط يحدد قطاعه تلقائيًا.',
  businessTypeHint:'تتوفر 111 نوعًا من الأنشطة التجارية، بالإضافة إلى خيار مخصص.',
  businessTypeCustom:'أدخل نوع نشاطك التجاري *',customBusinessTypePlaceholder:'اكتب نوع نشاطك',
  customBusinessTypeOption:'نشاطي غير مدرج — أدخله',
  customBusinessTypeGroup:'نوع نشاط آخر',
  industryRetail:'التجارة بالتجزئة والجملة',industryFood:'الأغذية والضيافة والترفيه',
  industryHospitals:'المستشفيات ومرافق الرعاية الصحية',industryHealthcare:'الرعاية الصحية والأدوية',
  industryAutomotive:'السيارات والنقل',industryConstruction:'البناء والصناعة',
  industryProfessional:'الخدمات المهنية والشخصية',industryEducation:'التعليم والتدريب',
  industryAgriculture:'الزراعة ومصايد الأسماك',industryProperty:'العقارات والتأجير',
  industryFinancial:'الخدمات المالية والإدارية',industrySports:'الرياضة وإدارة الدوريات المحلية',
  industryGeneral:'الأعمال العامة والمتعددة القطاعات'
});
Object.assign(extraWords.hi,{
  chooseIndustry:'उद्योग चुनें',chooseBusinessType:'व्यवसाय का प्रकार चुनें',
  businessTypeSearchLabel:'सभी 111 उपलब्ध व्यवसाय प्रकार खोजें',
  businessTypeSearchPlaceholder:'व्यवसाय का नाम खोजने के लिए लिखें',
  businessTypeSearchHint:'सभी प्रकार उद्योग के अनुसार समूहित हैं। प्रकार चुनने पर उसका उद्योग भी चुना जाएगा।',
  businessTypeHint:'111 व्यवसाय प्रकार और एक कस्टम विकल्प उपलब्ध हैं।',
  businessTypeCustom:'अपने व्यवसाय का प्रकार लिखें *',customBusinessTypePlaceholder:'अपने व्यवसाय का नाम लिखें',
  customBusinessTypeOption:'मेरा व्यवसाय सूची में नहीं है — लिखें',
  customBusinessTypeGroup:'अन्य व्यवसाय प्रकार',
  industryRetail:'खुदरा और व्यापार',industryFood:'खाद्य, आतिथ्य और मनोरंजन',
  industryHospitals:'अस्पताल और स्वास्थ्य सुविधाएँ',industryHealthcare:'स्वास्थ्य सेवा और फार्मास्यूटिकल',
  industryAutomotive:'ऑटोमोटिव और परिवहन',industryConstruction:'निर्माण और उद्योग',
  industryProfessional:'पेशेवर और व्यक्तिगत सेवाएँ',industryEducation:'शिक्षा और प्रशिक्षण',
  industryAgriculture:'कृषि और मत्स्य पालन',industryProperty:'संपत्ति और किराया',
  industryFinancial:'वित्तीय और प्रशासनिक सेवाएँ',industrySports:'खेल और स्थानीय लीग प्रबंधन',
  industryGeneral:'सामान्य और बहु-उद्योग व्यवसाय'
});
Object.assign(extraWords.zh,{
  chooseIndustry:'选择行业',chooseBusinessType:'选择业务类型',
  businessTypeSearchLabel:'搜索全部 111 种支持的业务类型',
  businessTypeSearchPlaceholder:'输入业务名称进行搜索',
  businessTypeSearchHint:'所有业务类型按行业分组。选择业务类型时也会自动选择相应行业。',
  businessTypeHint:'提供 111 种业务类型，另有自定义选项。',
  businessTypeCustom:'填写您的业务类型 *',customBusinessTypePlaceholder:'输入您的业务类型',
  customBusinessTypeOption:'未找到我的业务类型 — 手动填写',
  customBusinessTypeGroup:'其他业务类型',
  industryRetail:'零售与贸易',industryFood:'食品、酒店与娱乐',
  industryHospitals:'医院与医疗机构',industryHealthcare:'医疗保健与制药',
  industryAutomotive:'汽车与运输',industryConstruction:'建筑与工业',
  industryProfessional:'专业与个人服务',industryEducation:'教育与培训',
  industryAgriculture:'农业与渔业',industryProperty:'房地产与租赁',
  industryFinancial:'金融与行政服务',industrySports:'体育与本地联赛管理',
  industryGeneral:'综合及多行业业务'
});

Object.keys(extraWords).forEach(lang=>Object.assign(words[lang],extraWords[lang]));

function setLanguage(lang){const dict=words[lang]||words.en;document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';if(typeof window.wlSetLanguage==='function'&&window.wlGetLanguage?.()!==lang)window.wlSetLanguage(lang);document.querySelectorAll('[data-t]').forEach(el=>{const k=el.dataset.t;if(dict[k])el.textContent=dict[k]});document.querySelectorAll('[data-t-placeholder]').forEach(el=>{const k=el.dataset.tPlaceholder;if(dict[k])el.placeholder=dict[k]});$('language').value=lang;try{localStorage.setItem('klt-business-application-language',lang)}catch(_){}if(typeof renderBusinessCatalog==='function')renderBusinessCatalog();if(typeof syncApplicationKind==='function')syncApplicationKind()}
$('language').addEventListener('change',e=>setLanguage(e.target.value));
function message(el,text,error=false){el.textContent=text;el.classList.toggle('error',error);el.classList.remove('hidden')}

const BUSINESS_INDUSTRY_GROUPS=Array.isArray(window.KLT_BUSINESS_INDUSTRY_GROUPS)?window.KLT_BUSINESS_INDUSTRY_GROUPS:[];
const INDUSTRY_LABEL_KEYS={
 'Retail and trading':'industryRetail',
 'Food, hospitality and entertainment':'industryFood',
 'Hospitals and healthcare facilities':'industryHospitals',
 'Healthcare and pharmaceutical':'industryHealthcare',
 'Automotive and transport':'industryAutomotive',
 'Construction and industrial':'industryConstruction',
 'Professional and personal services':'industryProfessional',
 'Education and training':'industryEducation',
 'Agriculture and fisheries':'industryAgriculture',
 'Property and rental':'industryProperty',
 'Financial and administrative services':'industryFinancial',
 'Sports and local league management':'industrySports',
 'General and multi-industry':'industryGeneral'
};
function applicationDictionary(){return words[$('language')?.value]||words.en}
function translateCatalogBusinessType(value){
 const translated=typeof window.wlTranslateText==='function'?window.wlTranslateText(value):value;
 return translated&&translated!==value?translated:value;
}
function translateIndustryGroup(value){
 const dict=applicationDictionary(),key=INDUSTRY_LABEL_KEYS[value];
 return (key&&dict[key])||translateCatalogBusinessType(value);
}
function isCustomBusinessType(value){
 return value==='__custom__'||value==='Other / not listed';
}
function updateCustomBusinessTypeField(){
 const custom=isCustomBusinessType($('business_type')?.value);
 const host=$('businessTypeCustomField'),input=$('business_type_custom');
 if(host)host.classList.toggle('hidden',!custom);
 if(input){input.required=custom;input.disabled=!custom;}
}
function populateIndustryOptions(selected){
 const select=$('industry_group');if(!select)return;
 const dict=applicationDictionary();
 select.replaceChildren(new Option(dict.chooseIndustry||'Choose an industry',''));
 BUSINESS_INDUSTRY_GROUPS.forEach(group=>select.add(new Option(translateIndustryGroup(group.label),group.label)));
 if(selected!==undefined)select.value=selected;
}
function populateBusinessTypeOptions(selected,filter){
 const select=$('business_type');if(!select)return;
 const dict=applicationDictionary();
 const query=String(filter===undefined?$('businessTypeSearch')?.value||'':filter).trim().toLocaleLowerCase();
 select.replaceChildren(new Option(dict.chooseBusinessType||'Choose a business type',''));
 let matchedSelected=false;
 BUSINESS_INDUSTRY_GROUPS.forEach(group=>{
  const items=(group.items||[]).filter(item=>!query||item.toLocaleLowerCase().includes(query)||translateCatalogBusinessType(item).toLocaleLowerCase().includes(query));
  if(!items.length)return;
  const optgroup=document.createElement('optgroup');optgroup.label=translateIndustryGroup(group.label);
  items.forEach(item=>{
   const option=new Option(translateCatalogBusinessType(item),item);
   if(item===selected)matchedSelected=true;
   optgroup.appendChild(option);
  });
  select.appendChild(optgroup);
 });
 const customGroup=document.createElement('optgroup');
 customGroup.label=dict.customBusinessTypeGroup||'Other business type';
 customGroup.appendChild(new Option(dict.customBusinessTypeOption||'My business type is not listed — enter it','__custom__'));
 select.appendChild(customGroup);
 if(selected){
  if(selected==='__custom__'||selected==='Other / not listed')select.value=selected;
  else if(matchedSelected)select.value=selected;
  else{
   select.value='__custom__';
   if($('business_type_custom'))$('business_type_custom').value=selected;
  }
 }
 updateCustomBusinessTypeField();
}
function renderBusinessCatalog(){
 if(!BUSINESS_INDUSTRY_GROUPS.length)return;
 const groupValue=$('industry_group')?.value||'';
 const typeValue=$('business_type')?.value||'';
 populateIndustryOptions(groupValue);
 populateBusinessTypeOptions(typeValue,$('businessTypeSearch')?.value||'');
}
function getSelectedBusinessType(formValue){
 if(isCustomBusinessType(formValue))return $('business_type_custom')?.value.trim()||'';
 return formValue;
}
function initialiseBusinessCatalog(){
 if(!BUSINESS_INDUSTRY_GROUPS.length){
  message($('applicationStatus'),'The business catalogue could not be loaded. Refresh the page and try again.',true);
  return;
 }
 populateIndustryOptions('');
 populateBusinessTypeOptions('');
 $('industry_group').addEventListener('change',()=>{
  const selected=$('business_type').value;
  const typeGroup=BUSINESS_INDUSTRY_GROUPS.find(group=>(group.items||[]).includes(selected));
  if(typeGroup&&typeGroup.label!==$('industry_group').value)$('business_type').value='';
  updateCustomBusinessTypeField();
 });
 $('business_type').addEventListener('change',()=>{
  const selected=$('business_type').value;
  const typeGroup=BUSINESS_INDUSTRY_GROUPS.find(group=>(group.items||[]).includes(selected));
  if(typeGroup)$('industry_group').value=typeGroup.label;
  updateCustomBusinessTypeField();
 });
 $('businessTypeSearch').addEventListener('input',()=>{
  const selected=$('business_type').value;
  const query=$('businessTypeSearch').value.trim().toLocaleLowerCase();
  const selectedIsCatalog=BUSINESS_INDUSTRY_GROUPS.some(group=>(group.items||[]).includes(selected));
  const stillMatches=selectedIsCatalog&&(!query||selected.toLocaleLowerCase().includes(query)||translateCatalogBusinessType(selected).toLocaleLowerCase().includes(query));
  populateBusinessTypeOptions(selected==='__custom__'||selected==='Other / not listed'?selected:(stillMatches?selected:''),query);
 });
}

function fill(app){
 if(!app||!Object.keys(app).length)return;
 for(const key of ['full_name','phone','business_name','currency_code','contact_email','contact_phone','country','address','website','tax_registration_number','notes'])if($(key)&&app[key]!=null)$(key).value=app[key];
 if($('application_kind'))$('application_kind').value=app.application_kind||'business';
 const club=app.club_details||{};
 for(const key of ['official_club_name','short_name','club_type','district','city','competition_name','home_ground','club_registration_body','club_registration_number','manager_full_name','manager_role','proposed_website_slug','authority_statement','evidence_reference'])if($(key)&&club[key]!=null)$(key).value=club[key];
 if(app.application_kind!=='football_club'){
  $('industry_group').value=app.industry_group||'';
  $('businessTypeSearch').value='';
  populateBusinessTypeOptions(app.business_type||'');
 }else{
  $('industry_group').value='Sports and local league management';
 }
 syncApplicationKind();
}
 if(!app||!Object.keys(app).length)return;
 for(const key of ['full_name','phone','business_name','industry_group','business_type','currency_code','contact_email','contact_phone','country','address','website','tax_registration_number','notes'])if($(key)&&app[key]!=null)$(key).value=app[key];
 if($('application_kind'))$('application_kind').value=app.application_kind||'business';
 const club=app.club_details||{};
 for(const key of ['official_club_name','short_name','club_type','district','city','competition_name','home_ground','club_registration_body','club_registration_number','manager_full_name','manager_role','proposed_website_slug','authority_statement','evidence_reference'])if($(key)&&club[key]!=null)$(key).value=club[key];
 syncApplicationKind();
}
function syncApplicationKind(){
 const isClub=$('application_kind')?.value==='football_club';
 $('footballClubFields')?.classList.toggle('hidden',!isClub);
 document.querySelectorAll('[data-club-required]').forEach(el=>{el.disabled=!isClub;el.required=isClub});
 if(isClub){
  $('industry_group').value='Sports and local league management';
  populateBusinessTypeOptions('Sports club / football club','');
  $('business_type').value='Sports club / football club';
  $('industry_group').disabled=true;$('business_type').disabled=true;$('businessTypeSearch').disabled=true;
  $('businessTypeCustomField').classList.add('hidden');$('business_type_custom').disabled=true;$('business_type_custom').required=false;
  if(!$('official_club_name').value)$('official_club_name').value=$('business_name').value;
  if(!$('business_name').value)$('business_name').value=$('official_club_name').value;
  if(!$('manager_full_name').value)$('manager_full_name').value=$('full_name').value;
  if(!$('contact_email').value)$('contact_email').value=session?.user?.email||'';
  if(!$('contact_phone').value)$('contact_phone').value=$('phone').value;
 }else{
  $('industry_group').disabled=false;$('business_type').disabled=false;$('businessTypeSearch').disabled=false;
  $('business_type_custom').disabled=!isCustomBusinessType($('business_type').value);
  $('business_type').readOnly=false;
  updateCustomBusinessTypeField();
 }
 const submit=$('submitApplication');
 if(submit)submit.textContent=(words[$('language').value]||words.en)[isClub?'submitClub':'submit'];
}
$('application_kind').addEventListener('change',syncApplicationKind);
$('official_club_name').addEventListener('input',()=>{if($('application_kind').value==='football_club')$('business_name').value=$('official_club_name').value});
$('business_name').addEventListener('input',()=>{if($('application_kind').value==='football_club'&&!$('official_club_name').value)$('official_club_name').value=$('business_name').value});
$('full_name').addEventListener('input',()=>{if($('application_kind').value==='football_club'&&!$('manager_full_name').value)$('manager_full_name').value=$('full_name').value});
$('phone').addEventListener('input',()=>{if($('application_kind').value==='football_club')$('contact_phone').value=$('phone').value});
async function refresh(){
 const {data,error}=await client.rpc('get_my_platform_business_application');
 if(error)throw error;
 application=data||{};
 if(application.application_id||application.id){
  fill(application);
  const status=application.status||'pending';
  syncApplicationKind();
  $('applicationStatus').hidden=false;
  const dict=words[$('language').value]||words.en;
  message($('applicationStatus'),dict[status]||status);
  $('applicationForm').classList.toggle('hidden',status==='pending'||status==='approved');
  if(status==='approved')$('applicationStatus').innerHTML=dict.approved+' <a href="./index.html">Open workspace</a>';
  else if(status==='pending')$('applicationStatus').innerHTML=dict.pending+' <a href="./index.html">Return to sign in</a>';
  else if(status==='needs_information'||status==='rejected')$('applicationForm').classList.remove('hidden');
  if(application.review_note){
    const note=document.createElement('p');
    note.style.cssText='margin:10px 0 0;padding:10px;border-radius:8px;background:#fff8e8;color:#6d5420';
    note.textContent='Developer review note: '+application.review_note;
    $('applicationStatus').appendChild(note);
  }
 }else{$('applicationForm').classList.remove('hidden');$('applicationStatus').classList.add('hidden')}
}
async function showSession(){
 const {data:{session:s}}=await client.auth.getSession();session=s;
 if(!session){$('authCard').classList.remove('hidden');$('applicationCard').classList.add('hidden');return}
 const {data:userData,error}=await client.auth.getUser();if(error)throw error;
 if(!userData.user?.email_confirmed_at){$('authCard').classList.remove('hidden');$('applicationCard').classList.add('hidden');message($('authStatus'),'Confirm your email address before submitting an application.',true);return}
 $('authCard').classList.add('hidden');$('applicationCard').classList.remove('hidden');
 message($('applicationStatus'),(words[$('language').value]||words.en).signedIn);
 await refresh();
}
$('signIn').addEventListener('click',async()=>{
 const email=$('email').value.trim(),password=$('password').value;
 if(!email||!password){message($('authStatus'),'Enter your account email and password.',true);return}
 $('signIn').disabled=true;
 try{const {data,error}=await client.auth.signInWithPassword({email,password});if(error)throw error;session=data.session;await showSession()}
 catch(e){message($('authStatus'),(words[$('language').value]||words.en).error+(e.message||'Sign-in failed'),true)}
 finally{$('signIn').disabled=false}
});
$('applicationForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!session){message($('applicationStatus'),(words[$('language').value]||words.en).loginRequired,true);return}
 const f=new FormData(e.currentTarget),v=k=>String(f.get(k)||'').trim();
 const kind=$('application_kind').value;
 const isClub=kind==='football_club';
 const file=$('evidence_file')?.files?.[0]||null;
 if(file&&file.size>10*1024*1024){message($('applicationStatus'),'The supporting evidence file must be 10 MB or smaller.',true);return}
 const businessTypeValue=isClub?'Football club':getSelectedBusinessType(v('business_type'));
 if(!isClub&&!v('industry_group')){message($('applicationStatus'),(words[$('language').value]||words.en).chooseIndustry||'Choose an industry.',true);return}
 if(!isClub&&!businessTypeValue){message($('applicationStatus'),(words[$('language').value]||words.en).businessTypeCustom||'Enter your business type.',true);return}
 const clubPayload=isClub?{
  official_club_name:v('official_club_name')||v('business_name'),
  short_name:v('short_name'),club_type:v('club_type'),country:v('country'),
  district:v('district'),city:v('city'),competition_name:v('competition_name'),
  home_ground:v('home_ground'),club_registration_body:v('club_registration_body'),
  club_registration_number:v('club_registration_number'),
  manager_full_name:v('manager_full_name')||v('full_name'),manager_role:v('manager_role'),
  contact_email:v('contact_email')||session.user.email,contact_phone:v('contact_phone')||v('phone'),
  official_website_url:v('website'),proposed_website_slug:v('proposed_website_slug'),
  authority_statement:v('authority_statement'),evidence_reference:v('evidence_reference'),
  additional_notes:v('notes'),declaration_confirmed:f.get('club_declaration')==='on'
 }:{};
 const payload={
  p_full_name:v('full_name'),p_phone:v('phone'),
  p_business_name:isClub?(v('official_club_name')||v('business_name')):v('business_name'),
  p_industry_group:isClub?'Sports and local league management':v('industry_group'),
  p_business_type:businessTypeValue,
  p_currency_code:isClub?'SLE':v('currency_code'),
  p_contact_email:v('contact_email'),p_contact_phone:v('contact_phone'),
  p_country:v('country'),p_address:isClub?[v('home_ground'),v('city'),v('district'),v('country')].filter(Boolean).join(', '):v('address'),
  p_website:v('website'),p_tax_registration_number:v('tax_registration_number'),
  p_notes:v('notes'),p_application_kind:kind,p_special_application_data:clubPayload
 };
 $('submitApplication').disabled=true;
 try{
  const {data,error}=await client.rpc('submit_platform_business_application_unified',payload);
  if(error)throw error;
  if(isClub&&file&&data?.football_club_application_id){
   const nameParts=(file.name||'club-evidence').split('.');
   const ext=(nameParts.length>1?nameParts.pop():'pdf').toLowerCase().replaceAll(/[^a-z0-9]/g,'')||'pdf';
   const base=nameParts.join('.').toLowerCase().replaceAll(/[^a-z0-9]+/g,'-').replaceAll(/^-|-$/g,'').slice(0,60)||'club-evidence';
   const path=session.user.id+'/'+data.football_club_application_id+'/'+Date.now()+'-'+base+'.'+ext;
   const uploaded=await client.storage.from('club-onboarding-evidence').upload(path,file,{upsert:false,contentType:file.type});
   if(uploaded.error)throw new Error('Application submitted, but the evidence upload failed: '+uploaded.error.message+'. You can attach it again if the developer requests it.');
   const attached=await client.rpc('attach_my_football_club_application_evidence',{p_application_id:data.football_club_application_id,p_evidence_path:path});
   if(attached.error)throw new Error('Application submitted, but the evidence attachment failed: '+attached.error.message);
   $('evidence_file').value='';
  }
  await refresh();
  const dict=words[$('language').value]||words.en;
  message($('applicationStatus'),isClub?dict.pendingClub:dict.pending);
 }catch(err){message($('applicationStatus'),(words[$('language').value]||words.en).error+(err.message||'Submission failed'),true)}
 finally{$('submitApplication').disabled=false;syncApplicationKind()}
});
client.auth.onAuthStateChange((_event,next)=>{session=next;if(next)setTimeout(()=>showSession().catch(e=>message($('authStatus'),e.message,true)),0)});
initialiseBusinessCatalog();
setLanguage(localStorage.getItem('klt-business-application-language')||'en');
const queryKind=new URLSearchParams(window.location.search).get('application');
if(queryKind==='football-club'||queryKind==='football_club')$('application_kind').value='football_club';
syncApplicationKind();
showSession().catch(e=>{message($('authStatus'),e.message||'Could not load account status.',true)});
})();