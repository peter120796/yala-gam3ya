/**
 * Legal drafts (Arabic + English). These are LEGALLY REVIEWABLE DRAFTS, not
 * final text and not a claim of compliance. Every section marked `review`
 * must be checked by Egyptian legal counsel before production launch
 * (see docs/LEGAL_REVIEW_CHECKLIST.md).
 */
export type LegalSlug = "terms" | "privacy" | "disclaimer" | "subscription" | "contact";
export interface LegalSection {
  heading: string;
  body: string[];
  review?: boolean;
}
export interface LegalDoc {
  title: string;
  updated: string;
  sections: LegalSection[];
}

const UPDATED = "2026-11-11";

const en: Record<LegalSlug, LegalDoc> = {
  terms: {
    title: "Terms & Conditions",
    updated: UPDATED,
    sections: [
      {
        heading: "1. What Yala-Gam3ya is",
        body: [
          "Yala-Gam3ya is organizational software that helps people keep records of rotating savings groups (\"Gam3yas\"): schedules, contribution due dates, payout order and recorded statuses.",
          "Yala-Gam3ya is not a bank, payment service, lender, investment service or financial institution.",
        ],
        review: true,
      },
      {
        heading: "2. What the platform does not do",
        body: [
          "The platform does not collect Gam3ya contributions, receive or hold member funds, transfer or distribute payouts, guarantee payments or member reliability, verify payments with banks, or offer loans or investment products.",
          "The platform never asks for bank details, national IDs, payment card details, wallet credentials or InstaPay addresses for Gam3ya operations. Do not enter them anywhere in the app.",
          "Yala-Gam3ya is not a party to any agreement between Gam3ya participants.",
        ],
        review: true,
      },
      {
        heading: "3. Your responsibilities",
        body: [
          "Participants and organizers are solely responsible for their own arrangements, payments and financial commitments with each other.",
          "Recorded statuses (for example \"Recorded paid\" or \"Confirmed completed\") are information entered by authorized users. They are not verified bank transactions and may be incomplete or inaccurate.",
          "You must keep your login credentials confidential and tell us promptly about any unauthorized use of your account.",
        ],
        review: true,
      },
      {
        heading: "4. Accounts and roles",
        body: [
          "Accounts are created by invitation. Administrators may assign organizer roles for specific Gam3yas. Administrators may deactivate accounts that breach these Terms; deactivation preserves historical records.",
        ],
      },
      {
        heading: "5. Acceptable use",
        body: [
          "You may not use the platform for any unlawful purpose, to collect funds from the public, to misrepresent another person, or to attempt to access data you are not authorized to see.",
        ],
        review: true,
      },
      {
        heading: "6. Fees",
        body: [
          "The platform is currently provided free of charge. An optional annual software subscription may be introduced in the future. Accepting these Terms is not consent to any future paid subscription; any subscription will require separate, explicit consent with transparent pricing and clear renewal and cancellation terms.",
          "Any software subscription fee is completely separate from Gam3ya contributions.",
        ],
        review: true,
      },
      {
        heading: "7. Limitation of liability",
        body: [
          "To the extent permitted by applicable law, Yala-Gam3ya is not liable for losses arising from arrangements between participants, from missed or late payments, or from inaccurate records entered by users.",
        ],
        review: true,
      },
      {
        heading: "8. Changes and governing law",
        body: [
          "We may update these Terms. Material changes will be shown in the app and require renewed acceptance. These Terms are intended to be governed by the laws of the Arab Republic of Egypt.",
        ],
        review: true,
      },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    updated: UPDATED,
    sections: [
      {
        heading: "1. Data we collect",
        body: [
          "Account data: name or display name, email address, optional mobile number, language and theme preferences.",
          "Gam3ya records: memberships, shares, schedules, recorded contribution and payout statuses, and who recorded them.",
          "Security data: sign-in events, audit logs of sensitive actions.",
          "We do not collect bank accounts, payment card details, national IDs, wallet credentials or InstaPay addresses.",
        ],
        review: true,
      },
      {
        heading: "2. How we use data",
        body: [
          "To show you your Gam3ya schedules, send reminders you have enabled, secure accounts, prevent abuse and keep an audit trail of record changes.",
        ],
      },
      {
        heading: "3. Who can see what",
        body: [
          "Other members of your Gam3ya see your display name and payout turn only. Organizers of your Gam3ya can see your contact details and your contribution records for that Gam3ya. Platform administrators can access data to operate and support the service.",
        ],
      },
      {
        heading: "4. Processors and international transfer",
        body: [
          "We use infrastructure providers (database and authentication hosting, application hosting, email delivery) that may store or process data outside Egypt.",
        ],
        review: true,
      },
      {
        heading: "5. Retention",
        body: [
          "Financial schedule records are retained to preserve an accurate history for all participants of a Gam3ya, even after an account is deactivated, for the period required by applicable law and legitimate interests.",
        ],
        review: true,
      },
      {
        heading: "6. Your rights",
        body: [
          "You may request access to, correction of, or deletion of your personal data, subject to legitimate retention obligations, by contacting support. We will respond within the period required by applicable law.",
        ],
        review: true,
      },
      {
        heading: "7. Security",
        body: ["We use encryption in transit, database-level access controls, multi-factor authentication for administrators and audit logging."],
      },
    ],
  },
  disclaimer: {
    title: "Disclaimer",
    updated: UPDATED,
    sections: [
      {
        heading: "Organizational records only",
        body: [
          "Yala-Gam3ya only organizes information. It never collects, holds, transfers or guarantees any money.",
          "All amounts shown are informational figures based on the Gam3ya's configuration and on statuses entered by users. Expected payouts are not money received.",
          "Nothing in the app is financial, legal or investment advice.",
        ],
        review: true,
      },
    ],
  },
  subscription: {
    title: "Subscription Policy",
    updated: UPDATED,
    sections: [
      {
        heading: "Current status",
        body: ["There are no paid plans today. No payment information is collected and no charges are made."],
      },
      {
        heading: "If subscriptions are introduced",
        body: [
          "Any future plan (for example Premium or Organizer Pro) will show its price, billing period, renewal and cancellation terms before you subscribe, and will require your explicit consent.",
          "Subscription fees are for the software only and are completely separate from Gam3ya contributions.",
          "If a subscription ends, you will keep access to information needed to understand your existing commitments and history.",
        ],
        review: true,
      },
    ],
  },
  contact: {
    title: "Contact & Support",
    updated: UPDATED,
    sections: [
      {
        heading: "Get help",
        body: [
          "For account help, privacy requests or to report a problem, email us at the support address below. Please never send passwords, bank details or ID documents.",
        ],
      },
    ],
  },
};

const ar: Record<LegalSlug, LegalDoc> = {
  terms: {
    title: "الشروط والأحكام",
    updated: UPDATED,
    sections: [
      {
        heading: "١. يعني إيه يلا جمعية",
        body: [
          "يلا جمعية برنامج تنظيمي بيساعد الناس يحتفظوا بسجلات الجمعيات الدوّارة: الجداول، مواعيد الأقساط، ترتيب القبض، والحالات المسجلة.",
          "يلا جمعية مش بنك، ولا خدمة دفع، ولا جهة إقراض أو استثمار، ولا مؤسسة مالية.",
        ],
        review: true,
      },
      {
        heading: "٢. اللي المنصة مش بتعمله",
        body: [
          "المنصة مش بتجمع أقساط الجمعية، ولا بتستلم أو بتحتفظ بفلوس الأعضاء، ولا بتحوّل أو بتوزّع القبض، ولا بتضمن الدفع أو التزام الأعضاء، ولا بتتأكد من الدفع مع البنوك، ولا بتقدم قروض أو منتجات استثمار.",
          "المنصة عمرها ما هتطلب بيانات حساب بنكي أو رقم قومي أو بيانات كارت أو محفظة أو عنوان InstaPay لتشغيل الجمعية. متكتبهاش في أي مكان في التطبيق.",
          "يلا جمعية مش طرف في أي اتفاق بين المشتركين في الجمعية.",
        ],
        review: true,
      },
      {
        heading: "٣. مسؤولياتك",
        body: [
          "المشتركين والمنظمين مسؤولين لوحدهم عن اتفاقاتهم ومدفوعاتهم والتزاماتهم المالية مع بعض.",
          "الحالات المسجلة (زي \"متسجل مدفوع\" أو \"اتأكد القبض\") معلومات بيدخلها مستخدمين مصرّح لهم، ومش تحويلات بنكية متأكد منها، وممكن تكون ناقصة أو مش دقيقة.",
          "لازم تحافظ على سرية بيانات دخولك وتبلغنا فورًا بأي استخدام مش مصرّح بيه لحسابك.",
        ],
        review: true,
      },
      {
        heading: "٤. الحسابات والأدوار",
        body: [
          "الحسابات بتتعمل بدعوة. الإدارة ممكن تحدد منظمين لجمعيات معينة، وممكن توقف الحسابات اللي بتخالف الشروط، والإيقاف بيحافظ على السجلات القديمة.",
        ],
      },
      {
        heading: "٥. الاستخدام المقبول",
        body: [
          "ممنوع استخدام المنصة لأي غرض مخالف للقانون، أو لجمع فلوس من الجمهور، أو لانتحال شخصية حد، أو لمحاولة الوصول لبيانات مش مسموحلك بيها.",
        ],
        review: true,
      },
      {
        heading: "٦. الرسوم",
        body: [
          "المنصة مجانية حاليًا. ممكن في المستقبل يكون في اشتراك سنوي اختياري للبرنامج. موافقتك على الشروط دي مش موافقة على أي اشتراك مدفوع في المستقبل؛ أي اشتراك هيحتاج موافقة منفصلة وصريحة، بسعر واضح وشروط تجديد وإلغاء واضحة.",
          "أي رسوم اشتراك في البرنامج منفصلة تمامًا عن أقساط الجمعية.",
        ],
        review: true,
      },
      {
        heading: "٧. حدود المسؤولية",
        body: [
          "في حدود القانون المعمول بيه، يلا جمعية مش مسؤولة عن أي خسارة بسبب الاتفاقات بين المشتركين، أو التأخير أو عدم الدفع، أو السجلات غير الدقيقة اللي بيدخلها المستخدمين.",
        ],
        review: true,
      },
      {
        heading: "٨. التعديلات والقانون الحاكم",
        body: [
          "ممكن نحدّث الشروط دي. التعديلات المهمة هتظهر في التطبيق وهتحتاج موافقة جديدة. الشروط دي المقصود إنها تخضع لقوانين جمهورية مصر العربية.",
        ],
        review: true,
      },
    ],
  },
  privacy: {
    title: "سياسة الخصوصية",
    updated: UPDATED,
    sections: [
      {
        heading: "١. البيانات اللي بنجمعها",
        body: [
          "بيانات الحساب: الاسم أو الاسم الظاهر، البريد الإلكتروني، رقم الموبايل (اختياري)، وتفضيلات اللغة والمظهر.",
          "سجلات الجمعيات: العضويات، الأسهم، الجداول، حالات الأقساط والقبض المسجلة، ومين سجلها.",
          "بيانات الأمان: عمليات الدخول وسجل العمليات الحساسة.",
          "مش بنجمع حسابات بنكية ولا بيانات كروت ولا أرقام قومية ولا بيانات محافظ ولا عناوين InstaPay.",
        ],
        review: true,
      },
      {
        heading: "٢. بنستخدم البيانات في إيه",
        body: ["عشان نعرضلك جداول جمعياتك، ونبعت التذكيرات اللي فعّلتها، ونأمّن الحسابات، ونمنع إساءة الاستخدام، ونحتفظ بسجل لتعديلات البيانات."],
      },
      {
        heading: "٣. مين يقدر يشوف إيه",
        body: [
          "باقي أعضاء جمعيتك بيشوفوا اسمك الظاهر ودورك في القبض بس. منظم جمعيتك يقدر يشوف بيانات التواصل وسجل أقساطك في الجمعية دي. إدارة المنصة تقدر توصل للبيانات لتشغيل الخدمة ودعمها.",
        ],
      },
      {
        heading: "٤. مقدمي الخدمات والنقل خارج مصر",
        body: ["بنستخدم مزودي بنية تحتية (استضافة قاعدة البيانات والمصادقة، استضافة التطبيق، إرسال البريد) ممكن يخزنوا أو يعالجوا البيانات خارج مصر."],
        review: true,
      },
      {
        heading: "٥. مدة الاحتفاظ",
        body: ["سجلات الجداول المالية بتتحفظ عشان يفضل التاريخ دقيق لكل المشتركين في الجمعية، حتى بعد إيقاف الحساب، للمدة اللي يتطلبها القانون والمصلحة المشروعة."],
        review: true,
      },
      {
        heading: "٦. حقوقك",
        body: ["تقدر تطلب الاطلاع على بياناتك الشخصية أو تصحيحها أو حذفها، مع مراعاة التزامات الاحتفاظ المشروعة، عن طريق التواصل مع الدعم. هنرد في المدة اللي يحددها القانون."],
        review: true,
      },
      {
        heading: "٧. الأمان",
        body: ["بنستخدم التشفير أثناء النقل، وصلاحيات على مستوى قاعدة البيانات، والتأكيد بخطوتين لحسابات الإدارة، وسجل للعمليات."],
      },
    ],
  },
  disclaimer: {
    title: "إخلاء المسؤولية",
    updated: UPDATED,
    sections: [
      {
        heading: "سجلات تنظيمية بس",
        body: [
          "يلا جمعية بتنظّم المعلومات بس، ومش بتجمع ولا بتحتفظ ولا بتحوّل ولا بتضمن أي فلوس.",
          "كل المبالغ اللي بتظهر أرقام معلوماتية مبنية على إعدادات الجمعية والحالات اللي بيدخلها المستخدمين. القبض المتوقع مش فلوس اتقبضت.",
          "مفيش حاجة في التطبيق تعتبر نصيحة مالية أو قانونية أو استثمارية.",
        ],
        review: true,
      },
    ],
  },
  subscription: {
    title: "سياسة الاشتراكات",
    updated: UPDATED,
    sections: [
      { heading: "الوضع الحالي", body: ["مفيش باقات مدفوعة حاليًا. مش بنجمع أي بيانات دفع ومفيش أي رسوم."] },
      {
        heading: "لو اتعمل اشتراك في المستقبل",
        body: [
          "أي باقة مستقبلية (زي Premium أو Organizer Pro) هتوضح سعرها ومدة الفوترة وشروط التجديد والإلغاء قبل ما تشترك، وهتحتاج موافقتك الصريحة.",
          "رسوم الاشتراك للبرنامج بس، ومنفصلة تمامًا عن أقساط الجمعية.",
          "لو الاشتراك خلص، هتفضل تقدر توصل للمعلومات اللازمة لفهم التزاماتك الحالية وسجلك.",
        ],
        review: true,
      },
    ],
  },
  contact: {
    title: "التواصل والدعم",
    updated: UPDATED,
    sections: [
      {
        heading: "محتاج مساعدة؟",
        body: ["لأي مساعدة في الحساب أو طلبات الخصوصية أو للإبلاغ عن مشكلة، ابعتلنا على بريد الدعم اللي تحت. من فضلك متبعتش أبدًا كلمات سر أو بيانات بنكية أو صور بطاقات."],
      },
    ],
  },
};

export const legalDocs = { ar, en };
export const legalSlugs: LegalSlug[] = ["terms", "privacy", "disclaimer", "subscription", "contact"];
