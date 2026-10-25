# Client agreement: AI assistants clause (draft for QM, 25 Oct 2026)

For the quotation terms, the service request form (SRF) terms and the
laboratory's confidentiality statement (ISO/IEC 17025:2017 clause 4.2.1:
the laboratory informs the customer in advance of information it intends to
place in the public domain or share; clause 4.2.3 for information from other
sources).

## English

> **Use of AI assistants.** QIRLPL may use AI assistants from named providers
> (at present Anthropic Claude, and xAI Grok through Cursor) to look up and
> manage its laboratory records, including the customer's name, address,
> sample and test details. The assistants are used only by authorised senior
> staff with their own login, under the laboratory's confidentiality
> obligations; the providers process the data outside India under their
> business terms, without using it to train their models. Test results,
> reports and certificates are approved and issued only by authorised staff in
> the laboratory's own system. A customer who does not want its information
> processed in this way may say so in writing, and its name and address will be
> withheld from these assistants.

## हिंदी

> **AI सहायकों का उपयोग।** QIRLPL अपने लैब रिकॉर्ड देखने और संभालने के लिए नामित
> कंपनियों के AI सहायकों (अभी Anthropic Claude, और Cursor के माध्यम से xAI Grok)
> का उपयोग कर सकता है, जिनमें ग्राहक का नाम, पता, सैंपल और टेस्ट का विवरण शामिल है।
> इनका उपयोग केवल अधिकृत वरिष्ठ स्टाफ अपने लॉगिन से, लैब की गोपनीयता की शर्तों के तहत
> करता है; ये कंपनियाँ डेटा भारत से बाहर अपनी व्यावसायिक शर्तों पर प्रोसेस करती हैं और
> उस पर अपने मॉडल को प्रशिक्षित नहीं करतीं। टेस्ट रिज़ल्ट, रिपोर्ट और सर्टिफिकेट केवल
> अधिकृत स्टाफ लैब के अपने सिस्टम में ही स्वीकृत और जारी करता है। जो ग्राहक नहीं चाहता
> कि उसकी जानकारी इस तरह प्रोसेस हो, वह लिखित में बता सकता है; तब उसका नाम और पता इन
> सहायकों से छिपाया जाएगा।

## Note for the QM

The last sentence (a customer can opt out) needs one small change in the
connector before it is promised: the Director's answers are unredacted for
every client today. The `clients.ai_data_consent` flag exists; the connector
can redact a client who has opted out for everyone. Until that change is made,
leave the last sentence out or record opt-outs by hand.
