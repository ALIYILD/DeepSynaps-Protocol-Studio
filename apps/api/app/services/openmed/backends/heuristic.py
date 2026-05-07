"""In-process fallback backend.

Always available. No network, no model weights. Uses curated regex
patterns for medical entities and PII so the adapter has correct
behaviour even when the OpenMed HTTP service is offline.

Coverage is intentionally narrow: when `OPENMED_BASE_URL` is set this
backend is skipped in favour of the real model.
"""
from __future__ import annotations

import re
from typing import Iterable

from ..schemas import (
    AnalyzeResponse,
    ClinicalTextInput,
    DeidentifyResponse,
    EntityLabel,
    ExtractedClinicalEntity,
    HealthResponse,
    NeuromodulationExtractResponse,
    PIIEntity,
    PIIExtractResponse,
    PIILabel,
    TextSpan,
)


_MED_PATTERNS: dict[EntityLabel, list[str]] = {
    # ── Medications (comprehensive across specialties) ────────────────────────
    "medication": [
        # Psychotropics
        r"\b(sertraline|fluoxetine|escitalopram|paroxetine|citalopram|venlafaxine|duloxetine|"
        r"bupropion|mirtazapine|trazodone|amitriptyline|nortriptyline|imipramine|desipramine|"
        r"lithium|lamotrigine|valproate|valproic acid|carbamazepine|oxcarbazepine|"
        r"topiramate|gabapentin|pregabalin|levetiracetam|phenytoin|phenobarbital|"
        r"clonazepam|lorazepam|diazepam|alprazolam|temazepam|zolpidem|eszopiclone|"
        r"olanzapine|risperidone|quetiapine|aripiprazole|haloperidol|clozapine|ziprasidone|"
        r"lurasidone|brexpiprazole|cariprazine|asenapine|iloperidone|paliperidone|"
        r"methylphenidate|atomoxetine|amphetamine|lisdexamfetamine|dexmethylphenidate|"
        r"modafinil|armodafinil|pitolisant|solriamfetol|"
        r"propranolol|prazosin|hydroxyzine|buspirone|meclizine|"
        r"naltrexone|disulfiram|acamprosate|buprenorphine|methadone|"
        r"esketamine|ketamine|psilocybin|MDMA)\b",
        # Cardiovascular
        r"\b(atorvastatin|rosuvastatin|simvastatin|pravastatin|lovastatin|"
        r"lisinopril|enalapril|captopril|ramipril|perindopril|"
        r"losartan|valsartan|irbesartan|candesartan|olmesartan|"
        r"amlodipine|nifedipine|diltiazem|verapamil|"
        r"metoprolol|atenolol|carvedilol|labetalol|bisoprolol|nebivolol|"
        r"hydrochlorothiazide|chlorthalidone|furosemide|torsemide|bumetanide|"
        r"spironolactone|eplerenone|triamterene|"
        r"digoxin|amiodarone|sotalol|dofetilide|flecainide|propafenone|"
        r"warfarin|apixaban|rivaroxaban|dabigatran|edoxaban|"
        r"clopidogrel|aspirin|ticagrelor|prasugrel|"
        r"isosorbide mononitrate|isosorbide dinitrate|nitroglycerin|"
        r"ranolazine|ivabradine)\b",
        # Endocrine / metabolic
        r"\b(metformin|glipizide|glyburide|glimepiride|"
        r"sitagliptin|saxagliptin|linagliptin|alogliptin|"
        r"empagliflozin|dapagliflozin|canagliflozin|ertugliflozin|"
        r"liraglutide|semaglutide|dulaglutide|exenatide|tirzepatide|"
        r"insulin glargine|insulin detemir|insulin NPH|insulin lispro|insulin aspart|"
        r"levothyroxine|liothyronine|methimazole|propylthiouracil|"
        r"prednisone|prednisolone|methylprednisolone|dexamethasone|hydrocortisone|"
        r"alendronate|risedronate|zoledronic acid|denosumab|"
        r"phentermine|topiramate|naltrexone|bupropion|orlistat)\b",
        # Pain / anesthesia / musculoskeletal
        r"\b(ibuprofen|naproxen|diclofenac|celecoxib|meloxicam|etodolac|"
        r"acetaminophen|paracetamol|tramadol|tapentadol|oxycodone|hydrocodone|morphine|"
        r"fentanyl|buprenorphine|codeine|hydromorphone|oxymorphone|"
        r"methocarbamol|cyclobenzaprine|tizanidine|baclofen|carisoprodol|"
        r"triamcinolone|betamethasone|"
        r"gabapentin|pregabalin|duloxetine|venlafaxine|amitriptyline|nortriptyline|"
        r"lidocaine|bupivacaine|ropivacaine)\b",
        # Infectious disease / antibiotics
        r"\b(amoxicillin|ampicillin|penicillin|piperacillin|ticarcillin|"
        r"cefazolin|ceftriaxone|cefepime|ceftazidime|cefuroxime|cefoxitin|"
        r"azithromycin|clarithromycin|erythromycin|"
        r"ciprofloxacin|levofloxacin|moxifloxacin|"
        r"gentamicin|tobramycin|amikacin|"
        r"vancomycin|linezolid|daptomycin|"
        r"metronidazole|clindamycin|doxycycline|minocycline|tigecycline|"
        r"trimethoprim|sulfamethoxazole|TMP[- ]?SMX|nitrofurantoin|"
        r"fluconazole|voriconazole|posaconazole|isavuconazole|amphotericin B|"
        r"acyclovir|valacyclovir|famciclovir|ganciclovir|valganciclovir|"
        r"oseltamivir|zanamivir|remdesivir|nirmatrelvir|ritonavir|molnupiravir)\b",
        # Gastroenterology
        r"\b(omeprazole|esomeprazole|lansoprazole|pantoprazole|rabeprazole|"
        r"famotidine|cimetidine|ranitidine|"
        r"sucralfate|misoprostol|"
        r"ondansetron|promethazine|prochlorperazine|metoclopramide|"
        r"loperamide|diphenoxylate|"
        r"polyethylene glycol|lactulose|senna|bisacodyl|docusate|"
        r"infliximab|adalimumab|vedolizumab|ustekinumab)\b",
        # Pulmonary / allergy
        r"\b(albuterol|salbutamol|levalbuterol|"
        r"fluticasone|budesonide|beclomethasone|mometasone|"
        r"salmeterol|formoterol|indacaterol|olodaterol|"
        r"tiotropium|ipratropium|aclidinium|umeclidinium|"
        r"montelukast|zafirlukast|zileuton|"
        r"theophylline|aminophylline|"
        r"diphenhydramine|loratadine|cetirizine|fexofenadine|levocetirizine|"
        r"epinephrine|omalizumab|dupilumab)\b",
        # Oncology / hematology
        r"\b(carboplatin|cisplatin|oxaliplatin|"
        r"paclitaxel|docetaxel|nab-paclitaxel|"
        r"doxorubicin|epirubicin|daunorubicin|idarubicin|"
        r"cyclophosphamide|ifosfamide|"
        r"gemcitabine|capecitabine|5[- ]?FU|fluorouracil|"
        r"methotrexate|pemetrexed|"
        r"etoposide|irinotecan|topotecan|"
        r"vincristine|vinblastine|vinorelbine|"
        r"rituximab|trastuzumab|bevacizumab|cetuximab|panitumumab|"
        r"imatinib|dasatinib|nilotinib|bosutinib|"
        r"filgrastim|pegfilgrastim|epoetin alfa|darbepoetin alfa)\b",
        # Neurology (non-psych)
        r"\b(levodopa|carbidopa|ropinirole|pramipexole|rotigotine|"
        r"rasagiline|selegiline|safinamide|"
        r"amantadine|trihexyphenidyl|benztropine|"
        r"donepezil|rivastigmine|galantamine|memantine|"
        r"sumatriptan|rizatriptan|eletriptan|zolmitriptan|"
        r"botulinum toxin|onabotulinumtoxinA|"
        r"baclofen|tizanidine|dantrolene|cyclobenzaprine|"
        r"acetazolamide|topiramate|valproate|lamotrigine|carbamazepine|"
        r"prednisone|methylprednisolone)\b",
        # Urology / nephrology
        r"\b(tamsulosin|alfuzosin|silodosin|terazosin|doxazosin|"
        r"finasteride|dutasteride|"
        r"sildenafil|tadalafil|vardenafil|avanafil|"
        r"oxybutynin|tolterodine|solifenacin|darifenacin|mirabegron|"
        r"allopurinol|febuxostat|probenecid|colchicine)\b",
    ],
    # ── Diagnoses (all major specialties) ─────────────────────────────────────
    "diagnosis": [
        # Psychiatry
        r"\b(major depressive disorder|MDD|persistent depressive disorder|dysthymia|"
        r"generalized anxiety disorder|GAD|panic disorder|PTSD|"
        r"post[- ]?traumatic stress disorder|OCD|obsessive[- ]?compulsive disorder|"
        r"bipolar I|bipolar II|bipolar disorder|cyclothymia|"
        r"schizophrenia|schizoaffective disorder|delusional disorder|"
        r"ADHD|attention[- ]?deficit hyperactivity disorder|"
        r"autism spectrum disorder|ASD|intellectual disability|"
        r"insomnia disorder|narcolepsy|obstructive sleep apnea|OSA|"
        r"alcohol use disorder|AUD|opioid use disorder|OUD|"
        r"substance use disorder|SUD|cannabis use disorder|"
        r"borderline personality disorder|antisocial personality|"
        r"eating disorder|anorexia nervosa|bulimia nervosa|binge eating disorder|"
        r"adjustment disorder|somatoform disorder|conversion disorder|"
        r"dissociative identity disorder|depersonalization[- ]?derealization)\b",
        # Cardiology
        r"\b(coronary artery disease|CAD|myocardial infarction|MI|STEMI|NSTEMI|"
        r"unstable angina|stable angina|angina pectoris|"
        r"congestive heart failure|CHF|HFpEF|HFrEF|"
        r"atrial fibrillation|AFib|atrial flutter|"
        r"ventricular tachycardia|VT|ventricular fibrillation|VF|"
        r"supraventricular tachycardia|SVT|"
        r"hypertension|HTN|pulmonary hypertension|"
        r"aortic stenosis|mitral regurgitation|mitral stenosis|aortic regurgitation|"
        r"cardiomyopathy|dilated cardiomyopathy|hypertrophic cardiomyopathy|"
        r"restrictive cardiomyopathy|arrhythmogenic cardiomyopathy|"
        r"pericarditis|myocarditis|endocarditis|"
        r"deep vein thrombosis|DVT|pulmonary embolism|PE|"
        r"peripheral artery disease|PAD|aortic aneurysm|aortic dissection|"
        r"syncope|orthostatic hypotension|long QT syndrome|Brugada syndrome)\b",
        # Endocrinology / metabolic
        r"\b(type 1 diabetes|T1DM|type 2 diabetes|T2DM|gestational diabetes|"
        r"prediabetes|metabolic syndrome|insulin resistance|"
        r"hypothyroidism|hyperthyroidism|Graves disease|Hashimoto thyroiditis|"
        r"thyroid nodule|thyroid cancer|goiter|"
        r"Cushing syndrome|Addison disease|primary hyperaldosteronism|"
        r"pheochromocytoma|hyperparathyroidism|hypoparathyroidism|"
        r"osteoporosis|osteopenia|Paget disease of bone|"
        r"hyperlipidemia|dyslipidemia|familial hypercholesterolemia|"
        r"obesity|morbid obesity|polycystic ovary syndrome|PCOS|"
        r"acromegaly|growth hormone deficiency|diabetes insipidus|SIADH)\b",
        # Neurology
        r"\b(Alzheimer disease|vascular dementia|Lewy body dementia|frontotemporal dementia|"
        r"Parkinson disease|Parkinsonism|multiple system atrophy|progressive supranuclear palsy|"
        r"multiple sclerosis|MS|relapsing[- ]?remitting MS|secondary progressive MS|"
        r"amyotrophic lateral sclerosis|ALS|myasthenia gravis|Guillain[- ]?Barré syndrome|"
        r"epilepsy|focal epilepsy|generalized epilepsy|absence seizures|tonic[- ]?clonic seizures|"
        r"status epilepticus|febrile seizure|"
        r"migraine|tension[- ]?type headache|cluster headache|"
        r"stroke|ischemic stroke|hemorrhagic stroke|subarachnoid hemorrhage|SAH|"
        r"TIA|transient ischemic attack|"
        r"traumatic brain injury|TBI|concussion|chronic traumatic encephalopathy|CTE|"
        r"normal pressure hydrocephalus|idiopathic intracranial hypertension|"
        r"trigeminal neuralgia|Bell palsy|meningitis|encephalitis|"
        r"septic cavernous sinus thrombosis|cerebral venous sinus thrombosis|"
        r"restless legs syndrome|periodic limb movement disorder|"
        r"narcolepsy|idiopathic hypersomnia|"
        r"dysautonomia|postural orthostatic tachycardia syndrome|POTS)\b",
        # Oncology
        r"\b(breast cancer|lung cancer|non[- ]?small cell lung cancer|NSCLC|small cell lung cancer|SCLC|"
        r"colorectal cancer|colon cancer|rectal cancer|"
        r"prostate cancer|pancreatic cancer|gastric cancer|esophageal cancer|"
        r"hepatocellular carcinoma|HCC|cholangiocarcinoma|"
        r"ovarian cancer|endometrial cancer|cervical cancer|"
        r"renal cell carcinoma|bladder cancer|testicular cancer|"
        r"melanoma|basal cell carcinoma|squamous cell carcinoma|"
        r"glioblastoma|meningioma|pituitary adenoma|"
        r"lymphoma|Hodgkin lymphoma|non[- ]?Hodgkin lymphoma|"
        r"leukemia|AML|CML|ALL|CLL|"
        r"multiple myeloma|myelodysplastic syndrome|MDS|"
        r"thyroid cancer|papillary thyroid cancer|follicular thyroid cancer|"
        r"neuroendocrine tumor|carcinoid tumor|GIST)\b",
        # Pulmonology
        r"\b(asthma|COPD|chronic obstructive pulmonary disease|emphysema|chronic bronchitis|"
        r"pulmonary fibrosis|idiopathic pulmonary fibrosis|IPF|"
        r"interstitial lung disease|ILD|sarcoidosis|"
        r"pneumonia|bacterial pneumonia|viral pneumonia|COVID[- ]?19|"
        r"pulmonary embolism|PE|pleural effusion|pneumothorax|"
        r"lung cancer|mesothelioma|obstructive sleep apnea|OSA|"
        r"pulmonary hypertension|alpha[- ]?1 antitrypsin deficiency|"
        r"bronchiectasis|cystic fibrosis|"
        r"acute respiratory distress syndrome|ARDS|"
        r"tuberculosis|TB|latent TB)\b",
        # Gastroenterology
        r"\b(gerd|gastroesophageal reflux disease|peptic ulcer disease|PUD|"
        r"gastritis|gastroparesis|"
        r"irritable bowel syndrome|IBS|inflammatory bowel disease|IBD|"
        r"Crohn disease|ulcerative colitis|microscopic colitis|"
        r"celiac disease|lactose intolerance|"
        r"diverticulosis|diverticulitis|"
        r"hemorrhoids|anal fissure|perianal abscess|"
        r"fatty liver disease|NAFLD|NASH|alcoholic liver disease|"
        r"cirrhosis|hepatic encephalopathy|ascites|"
        r"hepatitis B|hepatitis C|autoimmune hepatitis|primary biliary cholangitis|"
        r"primary sclerosing cholangitis|"
        r"pancreatitis|acute pancreatitis|chronic pancreatitis|"
        r"cholelithiasis|cholecystitis|cholangitis|"
        r"colorectal cancer|gastric cancer|esophageal cancer|pancreatic cancer|"
        r"hepatocellular carcinoma|HCC|GI bleeding|upper GI bleed|lower GI bleed)\b",
        # Nephrology / urology
        r"\b(chronic kidney disease|CKD|acute kidney injury|AKI|end[- ]?stage renal disease|ESRD|"
        r"nephrotic syndrome|nephritic syndrome|"
        r"IgA nephropathy|focal segmental glomerulosclerosis|FSGS|"
        r"membranous nephropathy|minimal change disease|"
        r"polycystic kidney disease|autosomal dominant polycystic kidney disease|ADPKD|"
        r"urinary tract infection|UTI|pyelonephritis|cystitis|"
        r"nephrolithiasis|kidney stones|urolithiasis|"
        r"benign prostatic hyperplasia|BPH|prostatitis|"
        r"erectile dysfunction|urinary incontinence|overactive bladder|"
        r"bladder cancer|renal cell carcinoma|prostate cancer|testicular cancer)\b",
        # Infectious disease
        r"\b(sepsis|septic shock|bacteremia|fungemia|"
        r"HIV|AIDS|acute retroviral syndrome|"
        r"hepatitis B|hepatitis C|hepatitis A|"
        r"influenza|COVID[- ]?19|RSV|mononucleosis|EBV|CMV|"
        r"Lyme disease|Rocky Mountain spotted fever|ehrlichiosis|anaplasmosis|"
        r"malaria|dengue|Zika|West Nile virus|"
        r"tuberculosis|TB|latent TB|disseminated TB|"
        r"meningitis|bacterial meningitis|viral meningitis|fungal meningitis|"
        r"encephalitis|brain abscess|endocarditis|osteomyelitis|"
        r"cellulitis|necrotizing fasciitis|abscess|"
        r"pneumonia|URI|upper respiratory infection|sinusitis|pharyngitis|tonsillitis|"
        r"gastroenteritis|C\. difficile infection|CDI|"
        r"UTI|urinary tract infection|pyelonephritis|"
        r"sexually transmitted infection|STI|gonorrhea|chlamydia|syphilis|herpes|HPV)\b",
        # Rheumatology / immunology
        r"\b(rheumatoid arthritis|RA|systemic lupus erythematosus|SLE|lupus|"
        r"psoriatic arthritis|ankylosing spondylitis|"
        r"Sjögren syndrome|scleroderma|systemic sclerosis|"
        r"dermatomyositis|polymyositis|inclusion body myositis|"
        r"mixed connective tissue disease|overlap syndrome|"
        r"vasculitis|granulomatosis with polyangiitis|GPA|"
        r"microscopic polyangiitis|polyarteritis nodosa|"
        r"giant cell arteritis|temporal arteritis|Takayasu arteritis|"
        r"Behçet disease|IgG4[- ]?related disease|"
        r"gout|pseudogout|CPPD|osteoarthritis|fibromyalgia)\b",
        # Hematology
        r"\b(anemia|iron deficiency anemia|vitamin B12 deficiency|folate deficiency|"
        r"hemolytic anemia|autoimmune hemolytic anemia|AIHA|"
        r"sickle cell disease|sickle cell trait|thalassemia|"
        r"aplastic anemia|myelodysplastic syndrome|MDS|"
        r"immune thrombocytopenia|ITP|thrombotic thrombocytopenic purpura|TTP|"
        r"hemophilia A|hemophilia B|von Willebrand disease|"
        r"deep vein thrombosis|DVT|pulmonary embolism|PE|"
        r"disseminated intravascular coagulation|DIC|"
        r"polycythemia vera|essential thrombocythemia|myelofibrosis)\b",
        # Dermatology
        r"\b(atopic dermatitis|eczema|psoriasis|acne vulgaris|rosacea|"
        r"contact dermatitis|seborrheic dermatitis|"
        r"urticaria|angioedema|"
        r"cellulitis|impetigo|folliculitis|abscess|"
        r"herpes simplex|herpes zoster|shingles|"
        r"tinea pedis|tinea corporis|tinea cruris|onychomycosis|candidiasis|"
        r"basal cell carcinoma|squamous cell carcinoma|melanoma|"
        r"actinic keratosis|seborrheic keratosis|"
        r"vitiligo|alopecia areata|androgenetic alopecia)\b",
        # ENT / ophthalmology
        r"\b(otitis media|otitis externa|mastoiditis|sinusitis|rhinitis|"
        r"pharyngitis|tonsillitis|laryngitis|epiglottitis|"
        r"hearing loss|sensorineural hearing loss|conductive hearing loss|"
        r"Ménière disease|benign paroxysmal positional vertigo|BPPV|"
        r"cataract|glaucoma|age[- ]?related macular degeneration|AMD|"
        r"diabetic retinopathy|hypertensive retinopathy|retinal detachment|"
        r"uveitis|scleritis|keratitis|conjunctivitis|dry eye syndrome|"
        r"strabismus|amblyopia|refractive error|myopia|hyperopia|astigmatism|"
        r"optic neuritis|papilledema|ischemic optic neuropathy)\b",
        # OB/GYN
        r"\b(pregnancy|ectopic pregnancy|gestational diabetes|preeclampsia|"
        r"eclampsia|HELLP syndrome|placenta previa|placental abruption|"
        r"preterm labor|preterm birth|postpartum hemorrhage|"
        r"endometriosis|adenomyosis|uterine fibroids|leiomyoma|"
        r"polycystic ovary syndrome|PCOS|menopause|perimenopause|"
        r"ovarian cyst|ovarian cancer|endometrial cancer|cervical cancer|"
        r"vaginitis|bacterial vaginosis|yeast infection|candidiasis|"
        r"pelvic inflammatory disease|PID|mastitis|galactocele)\b",
        # Orthopedics / trauma
        r"\b(hip fracture|femoral neck fracture|intertrochanteric fracture|"
        r"vertebral compression fracture|spinal fracture|"
        r"distal radius fracture|Colles fracture|"
        r"ankle fracture|tibial fracture|fibular fracture|"
        r"rotator cuff tear|ACL tear|meniscal tear|"
        r"osteoarthritis|degenerative joint disease|DJD|"
        r"rheumatoid arthritis|gout|pseudogout|"
        r"carpal tunnel syndrome|cubital tunnel syndrome|"
        r"lumbar radiculopathy|sciatica|spinal stenosis|spondylolisthesis|"
        r"herniated disc|disc herniation|degenerative disc disease)\b",
    ],
    # ── Symptoms (comprehensive, all systems) ─────────────────────────────────
    "symptom": [
        r"\b(insomnia|fatigue|anhedonia|hopeless(?:ness)?|suicidal ideation|self[- ]harm|"
        r"panic attacks?|flashbacks?|nightmares?|hypervigilance|avoidance|"
        r"rumination|intrusive thoughts?|dissociation|depersonalization|derealization|"
        r"low mood|irritability|agitation|psychomotor (?:retardation|agitation)|"
        r"poor concentration|memory loss|brain fog|confusion|delirium|"
        r"chest pain|angina|pressure|tightness|substernal pain|"
        r"dyspnea|shortness of breath|SOB|orthopnea|paroxysmal nocturnal dyspnea|PND|"
        r"palpitations|racing heart|irregular heartbeat|"
        r"syncope|presyncope|lightheadedness|dizziness|vertigo|"
        r"edema|swelling|peripheral edema|pitting edema|"
        r"nausea|vomiting|hematemesis|diarrhea|constipation|melena|hematochezia|"
        r"abdominal pain|epigastric pain|RLQ pain|RUQ pain|LLQ pain|LUQ pain|"
        r"bloating|early satiety|dysphagia|odynophagia|heartburn|regurgitation|"
        r"jaundice|pruritus|dark urine|pale stools|"
        r"polyuria|polydipsia|nocturia|dysuria|urgency|frequency|hematuria|"
        r"oliguria|anuria|urinary retention|incontinence|"
        r"headache|migraine|photophobia|phonophobia|"
        r"weakness|numbness|tingling|paresthesia|"
        r"gait instability|ataxia|falls|balance problems|"
        r"tremor|rigidity|bradykinesia|dyskinesia|dystonia|"
        r"seizures?|aura|postictal state|"
        r"visual changes|blurred vision|diplopia|vision loss|scotoma|"
        r"hearing loss|tinnitus|otalgia|otorrhea|"
        r"fever|chills|rigors|night sweats|weight loss|weight gain|"
        r"loss of appetite|anorexia|cachexia|"
        r"cough|hemoptysis|wheezing|stridor|hoarseness|"
        r"rash|pruritus|urticaria|erythema|petechiae|purpura|ecchymosis|"
        r"joint pain|arthralgia|morning stiffness|back pain|neck pain|"
        r"muscle pain|myalgia|muscle weakness|muscle cramps|"
        r"menorrhagia|metrorrhagia|dysmenorrhea|amenorrhea|"
        r"vaginal bleeding|vaginal discharge|dyspareunia|pelvic pain)\b",
    ],
    # ── Procedures (diagnostic & therapeutic) ─────────────────────────────────
    "procedure": [
        r"\b(rTMS|TMS|tDCS|tACS|tRNS|ECT|psychotherapy|CBT|DBT|EMDR|exposure therapy|"
        r"qEEG|EEG|MRI|fMRI|PET scan|CT scan|CT head|CT chest|CT abdomen|"
        r"sleep study|polysomnography|MSLT|"
        r"ECG|EKG|echocardiogram|stress test|cardiac catheterization|angiography|"
        r"PCI|percutaneous coronary intervention|CABG|coronary artery bypass grafting|"
        r"pacemaker implantation|ICD implantation|ablation|"
        r"colonoscopy|sigmoidoscopy|upper endoscopy|EGD|ERCP|EUS|"
        r"laparoscopy|laparotomy|appendectomy|cholecystectomy|"
        r"hysterectomy|oophorectomy|cesarean section|C[- ]?section|"
        r"arthroscopy|joint replacement|hip replacement|knee replacement|"
        r"lumbar puncture|spinal tap|bone marrow biopsy|liver biopsy|kidney biopsy|"
        r"thoracentesis|paracentesis|amniocentesis|"
        r"intubation|mechanical ventilation|tracheostomy|"
        r"dialysis|hemodialysis|peritoneal dialysis|renal transplant|"
        r"biopsy|fine needle aspiration|FNA|excisional biopsy|"
        r"radiation therapy|chemotherapy|immunotherapy|targeted therapy|"
        r"blood transfusion|plasmapheresis|IVIG)\b",
    ],
    # ── Labs & assessments ────────────────────────────────────────────────────
    "lab": [
        r"\b(TSH|T3|T4|free T3|free T4|CBC|CMP|BMP|LFT|lipid panel|"
        r"HbA1c|fasting glucose|random glucose|OGTT|"
        r"vitamin D|B12|folate|iron|ferritin|TIBC|transferrin saturation|"
        r"cortisol|ACTH|aldosterone|renin|"
        r"CRP|ESR|procalcitonin|BNP|NT[- ]?proBNP|troponin|"
        r"PT|INR|aPTT|fibrinogen|D[- ]?dimer|"
        r"BUN|creatinine|eGFR|urinalysis|UACR|urine culture|"
        r"ALT|AST|alkaline phosphatase|bilirubin|albumin|total protein|"
        r"amylase|lipase|"
        r"PSA|CEA|CA[- ]?125|CA[- ]?19[- ]?9|AFP|LDH|"
        r"PHQ[- ]?9|GAD[- ]?7|MoCA|MMSE|SLUMS|"
        r"HAM[- ]?D|HAM[- ]?A|YBOCS|MADRS|BDI|"
        r"AUDIT|CAGE|CIWA[- ]?Ar)\b",
    ],
    # ── Anatomy ───────────────────────────────────────────────────────────────
    "anatomy": [
        r"\b(brain|cerebrum|cerebellum|brainstem|frontal lobe|parietal lobe|temporal lobe|occipital lobe|"
        r"basal ganglia|thalamus|hypothalamus|hippocampus|amygdala|"
        r"spinal cord|cervical spine|thoracic spine|lumbar spine|sacrum|coccyx|"
        r"heart|left ventricle|right ventricle|left atrium|right atrium|"
        r"aorta|aortic root|ascending aorta|descending aorta|"
        r"coronary arteries|LAD|left anterior descending|LCX|left circumflex|RCA|"
        r"lung|left lung|right lung|upper lobe|lower lobe|middle lobe|"
        r"liver|gallbladder|bile ducts|pancreas|spleen|"
        r"stomach|duodenum|jejunum|ileum|colon|cecum|appendix|rectum|anus|"
        r"kidney|left kidney|right kidney|ureter|bladder|urethra|prostate|"
        r"uterus|ovary|fallopian tube|cervix|vagina|vulva|"
        r"testis|epididymis|vas deferens|seminal vesicle|"
        r"thyroid|parathyroid|adrenal gland|pituitary gland|pineal gland|"
        r"bone|femur|tibia|fibula|humerus|radius|ulna|skull|vertebra|rib|pelvis|"
        r"joint|shoulder|elbow|wrist|hip|knee|ankle|"
        r"muscle|tendon|ligament|cartilage|meniscus)\b",
    ],
    # ── Vitals ────────────────────────────────────────────────────────────────
    "vital": [
        r"\b(?:BP|blood pressure)\s*(?:of)?\s*\d{2,3}[\/]\d{2,3}\b",
        r"\b(?:HR|heart rate|pulse)\s*(?:of)?\s*\d{2,3}\b",
        r"\b(?:RR|respiratory rate)\s*(?:of)?\s*\d{1,2}\b",
        r"\b(?:temp|temperature|T)\s*(?:of)?\s*\d{2,3}(?:\.\d)?\b",
        r"\b(?:SpO2|O2 sat|oxygen saturation)\s*(?:of)?\s*\d{2,3}\s*%?\b",
        r"\b(?:weight|wt)\s*(?:of)?\s*\d{2,3}(?:\.\d)?\s*(?:kg|lbs?)\b",
        r"\b(?:height|ht)\s*(?:of)?\s*\d{1,3}(?:\.\d)?\s*(?:cm|m|ft|in)\b",
        r"\b(?:BMI|body mass index)\s*(?:of)?\s*\d{1,2}(?:\.\d)?\b",
    ],
    # ── Risk factors ──────────────────────────────────────────────────────────
    "risk_factor": [
        r"\b(smoking|former smoker|current smoker|pack[- ]?year|tobacco use|"
        r"alcohol use|heavy alcohol use|illicit drug use|IV drug use|"
        r"family history|FHx|maternal history|paternal history|"
        r"obesity|overweight|sedentary lifestyle|"
        r"hypertension|diabetes|hyperlipidemia|"
        r"CAD|prior MI|prior stroke|prior DVT|prior PE|"
        r"immunosuppression|HIV|hepatitis B|hepatitis C|"
        r"malignancy|cancer history|radiation exposure|"
        r"occupational exposure|asbestos exposure|silica exposure)\b",
    ],
    # ── Allergies ─────────────────────────────────────────────────────────────
    "allergy": [
        r"\b(?:penicillin|amoxicillin|cephalosporin|sulfa|sulfonamide|"
        r"NSAID|aspirin|ibuprofen|codeine|morphine|"
        r"latex|iodine|contrast|shellfish|egg|peanut|tree nut|"
        r"milk|dairy|soy|wheat|gluten|"
        r"pollen|dust|mite|mold|dander|cat|dog|"
        r"bee sting|wasp|fire ant)\b(?:\s+allergy)?",
    ],
    # ── Devices ───────────────────────────────────────────────────────────────
    "device": [
        r"\b(Neurosoft|Magstim|MagVenture|BrainsWay|Apollo|Neuro|CloudTMS|"
        r"Soterix|Neuroelectrics|neuroConn|Sooma|Flow|"
        r"Nexstim|eNeura|SNS|VNS|NeuroPace|Medtronic|Boston Scientific|Abbott|"
        r"pacemaker|ICD|implantable cardioverter[- ]?defibrillator|"
        r"CRT|cardiac resynchronization therapy|"
        r"LVAD|left ventricular assist device|"
        r"insulin pump|continuous glucose monitor|CGM|"
        r"hearing aid|cochlear implant|"
        r"CPAP|BiPAP|APAP|ventilator|"
        r"wheelchair|walker|cane|crutches|prosthesis|orthosis)\b",
    ],
}

# ── Neuromodulation-specific patterns ──────────────────────────────────────────
_NEURO_PATTERNS: dict[EntityLabel, list[str]] = {
    "stimulation_protocol": [
        r"\b(?:10\s*Hz|1\s*Hz|5\s*Hz|20\s*Hz|theta[- ]?burst|TBS|cTBS|iTBS|"
        r"bilateral\s+rTMS|unilateral\s+rTMS|high[- ]?frequency|low[- ]?frequency)\b",
        r"\b(?:anodal\s+tDCS|cathodal\s+tDCS|bifrontal\s+tDCS|"
        r"sham\s+tDCS|active\s+tDCS|2\s*mA|1\s*mA|1\.5\s*mA|0\.5\s*mA)\b",
        r"\b(?:bilateral\s+ECT|unilateral\s+ECT|bifrontal\s+ECT|"
        r"ultra[- ]?brief\s+pulse|brief\s+pulse|seizure[- ]?threshold)\b",
        r"\b(?:DBS\s+programming|VNS\s+parameter|FUS\s+protocol|"
        r"transcranial\s+focused\s+ultrasound|tFUS|TUS)\b",
    ],
    "device_parameter": [
        r"\b(?:\d+\.?\d*\s*Hz|\d+\.?\d*\s*mA|\d+\.?\d*\s*V|"
        r"\d+\.?\d*\s*ms\s*pulse|\d+\.?\d*\s*µs\s*pulse|"
        r"\d+\.?\d*\s*T|pulse\s+width|inter[- ]?train\s+interval|ITI|"
        r"train\s+duration|session\s+duration|\d+\s*pulses?\s*(?:per\s+session)?)\b",
        r"\b(?:\d+\s*trains?|\d+\s*blocks?|\d+\s*min(?:utes?)?\s*stimulation|"
        r"\d+\s*s(?:ec)?\s*ITI|\d+\s*s(?:ec)?\s*inter[- ]?stimulus)\b",
        r"\b(?:voltage\s+\d+\.?\d*\s*V|frequency\s+\d+\.?\d*\s*Hz|"
        r"pulse\s+width\s+\d+\.?\d*\s*µs|amplitude\s+\d+\.?\d*\s*mA|"
        r"contact\s+(?:C\+?\d+|0\+|1\+|2\+|3\+|case)|impedance\s+\d+\.?\d*\s*Ω)\b",
    ],
    "electrode_placement": [
        r"\b(?:F3|F4|Fz|C3|C4|Cz|P3|P4|Pz|O1|O2|T3|T4|T5|T6|Fp1|Fp2|"
        r"AF3|AF4|FC1|FC2|CP1|CP2|PO3|PO4|Oz|Iz)\b",
        r"\b(?:L[- ]?DLPFC|R[- ]?DLPFC|dorsolateral\s+prefrontal\s+cortex|BA\s*4[246]|"
        r"motor\s+cortex|M1|supplementary\s+motor\s+area|SMA|"
        r"pre[- ]?SMA|primary\s+motor|premotor|"
        r"anterior\s+cingulate\s+cortex|ACC|subgenual\s+ACC|sgACC|"
        r"orbitofrontal\s+cortex|OFC|inferior\s+frontal\s+gyrus|IFG|"
        r"left\s+prefrontal|right\s+prefrontal|bifrontal|bitemporal)\b",
        r"\b(?:figure[- ]?8\s+coil|round\s+coil|H[- ]?coil|"
        r"5\s*x\s*7\s*cm|5x7\s*cm|35\s*cm²|25\s*cm²|saline[- ]?soaked\s+sponge)\b",
    ],
    "outcome_measure": [
        r"\b(?:PHQ[- ]?9|GAD[- ]?7|HAM[- ]?D(?:\s*\d+)?|HAM[- ]?A(?:\s*\d+)?|"
        r"MADRS|BDI[- ]?II|BDI|STAI|BAI|"
        r"QIDS[- ]?SR|QIDS[- ]?C|SDS|CGI[- ]?S|CGI[- ]?I|PGI[- ]?C)\b",
        r"\b(?:Y[- ]?BOCS|CY[- ]?BOCS|PADQ|PTCI|PCL[- ]?5|CAPS[- ]?5|"
        r"IES[- ]?R|DASS[- ]?21|DASS)\b",
        r"\b(?:MoCA|MMSE|WAIS[- ]?IV|RBANS|CVLT|Trail\s+Making\s+(?:A|B)|"
        r"Stroop|Digit\s+Span|SF[- ]?36|EQ[- ]?5D|WHOQOL)\b",
        r"\b(?:VAS|NRS|McGill|MPQ|DN4|Brief\s+Pain\s+Inventory|BPI|"
        r"UPDRS|MDS[- ]?UPDRS|Fahn[- ]?Tolosa[- ]?Marin|AIMS|"
        r"EDSS|Kurtzke|NIHSS|mRS)\b",
        r"\b(?:PSQI|ISI|ESS|FOSQ|FACIT[- ]?Fatigue|FS[- ]?14)\b",
    ],
    "adverse_event": [
        r"\b(?:scalp\s+discomfort|headache|scalp\s+pain|tingling|burning\s+sensation|"
        r"itching|redness|skin\s+irritation|lightheadedness|dizziness|"
        r"hearing\s+discomfort|tinnitus|syncope|seizure|"
        r"manic\s+switch|hypomania|insomnia\s+worsening|anxiety\s+increase)\b",
        r"\b(?:memory\s+impairment|retrograde\s+amnesia|anterograde\s+amnesia|"
        r"confusion|post[- ]?ictal\s+confusion|muscle\s+ache|jaw\s+pain|"
        r"nausea|vomiting|prolonged\s+seizure|status\s+epilepticus)\b",
        r"\b(?:infection|lead\s+fracture|lead\s+migration|hardware\s+malfunction|"
        r"battery\s+depletion|stimulation[- ]?induced\s+side\s+effects?|"
        r"dysarthria|paresthesia|muscle\s+contraction|hoarseness|cough|"
        r"dyspnea|arrhythmia|bradycardia)\b",
    ],
    "neuromodulation_device": [
        r"\b(?:Magstim|MagVenture|BrainsWay|Apollo|Neuro|CloudTMS|"
        r"Soterix|Neuroelectrics|neuroConn|Sooma|Flow|Nexstim|eNeura|"
        r"NeuroPace|Medtronic|Boston\s+Scientific|Abbott|LivaNova|"
        r"MagPro|DuoMAG|Yiruide|STIMULUS|"
        r"HD[- ]?tDCS|Starstim|Grael|Grael\s+HD)\b",
    ],
}

_PII_PATTERNS: list[tuple[PIILabel, str]] = [
    ("email", r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    ("phone", r"\b(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}\b"),
    ("mrn", r"\bMRN[:#]?\s*[A-Z0-9-]{4,}\b"),
    ("ssn", r"\b\d{3}-\d{2}-\d{4}\b"),
    ("ip_address", r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
    ("url", r"https?://[^\s<>]+"),
    (
        "date",
        r"\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:19|20)\d{2}\b"
        r"|\b(?:19|20)\d{2}[/-](?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])\b"
        r"|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+(?:19|20)\d{2}\b",
    ),
    (
        "person_name",
        r"\b(?:Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b",
    ),
    ("address", r"\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way)\b"),
    ("id_number", r"\b(?:NHS|nhs)\s*(?:number|#)?\s*\d{3}[\s-]?\d{3}[\s-]?\d{4}\b"),
]


def _scan(patterns: Iterable[tuple[str, str]], text: str) -> list[tuple[str, str, int, int]]:
    """Return (label, match_text, start, end) tuples, longest match wins on overlap."""
    raw: list[tuple[str, str, int, int]] = []
    for label, pat in patterns:
        for m in re.finditer(pat, text, re.IGNORECASE):
            raw.append((label, m.group(0), m.start(), m.end()))
    raw.sort(key=lambda t: (t[2], -(t[3] - t[2])))
    out: list[tuple[str, str, int, int]] = []
    last_end = -1
    for tup in raw:
        if tup[2] >= last_end:
            out.append(tup)
            last_end = tup[3]
    return out


def _is_negated(text: str, start: int, end: int, window: int = 35) -> bool:
    """Check if a span is preceded by a negation cue within a window.

    This is a simple rule-based negation detector. It looks for negation
    cues (no, not, denies, without, etc.) within `window` chars before
    the entity span, stopping at sentence boundaries.
    """
    lookback_start = max(0, start - window)
    context = text[lookback_start:start]
    sentences = re.split(r'[.!?;]\s+', context)
    local_context = sentences[-1] if sentences else context
    negation_cues = [
        r'\bno\b', r'\bnot\b', r'\bden(?:y|ies|ied|ying)\b',
        r'\bwithout\b', r'\babsent\b', r'\bnegative\b',
        r'\bnever\b', r'\bnon[- ]?', r'\bno\s+evidence\s+of\b',
        r'\brules\s+out\b', r'\bro\b', r'\bunlikely\b',
        r'\bnot\s+present\b', r'\bnot\s+noted\b', r'\bnot\s+observed\b',
        r'\bfree\s+of\b', r'\bcleared\s+of\b',
    ]
    for cue in negation_cues:
        if re.search(cue, local_context, re.IGNORECASE):
            return True
    return False


def _extract_entities(text: str) -> list[ExtractedClinicalEntity]:
    pairs: list[tuple[str, str]] = []
    for label, pats in _MED_PATTERNS.items():
        for pat in pats:
            pairs.append((label, pat))
    entities = []
    for label, match, start, end in _scan(pairs, text):
        confidence = 0.55
        normalised = match.lower().strip()
        if _is_negated(text, start, end):
            confidence = 0.25
            normalised = f"negated: {normalised}"
        entities.append(
            ExtractedClinicalEntity(
                label=label,  # type: ignore[arg-type]
                text=match,
                span=TextSpan(start=start, end=end),
                normalised=normalised,
                confidence=confidence,
                source="heuristic",
            )
        )
    return entities


def _extract_neuromodulation_entities(text: str) -> list[ExtractedClinicalEntity]:
    """Extract neuromodulation-specific entities from clinical text."""
    pairs: list[tuple[str, str]] = []
    for label, pats in _NEURO_PATTERNS.items():
        for pat in pats:
            pairs.append((label, pat))
    for label, pats in _MED_PATTERNS.items():
        for pat in pats:
            pairs.append((label, pat))
    entities = []
    for label, match, start, end in _scan(pairs, text):
        confidence = 0.62
        normalised = match.lower().strip()
        if _is_negated(text, start, end):
            confidence = 0.28
            normalised = f"negated: {normalised}"
        entities.append(
            ExtractedClinicalEntity(
                label=label,  # type: ignore[arg-type]
                text=match,
                span=TextSpan(start=start, end=end),
                normalised=normalised,
                confidence=confidence,
                source="heuristic",
            )
        )
    return entities


def _extract_pii(text: str) -> list[PIIEntity]:
    return [
        PIIEntity(
            label=label,  # type: ignore[arg-type]
            text=match,
            span=TextSpan(start=start, end=end),
            confidence=0.6,
        )
        for label, match, start, end in _scan(_PII_PATTERNS, text)
    ]


def _short_summary(text: str, entities: list[ExtractedClinicalEntity]) -> str:
    counts: dict[str, int] = {}
    negated_counts: dict[str, int] = {}
    for e in entities:
        if e.normalised and e.normalised.startswith("negated:"):
            negated_counts[e.label] = negated_counts.get(e.label, 0) + 1
        else:
            counts[e.label] = counts.get(e.label, 0) + 1
    if not counts and not negated_counts:
        return f"{len(text)} chars analysed; no entities recovered by heuristic backend."
    parts = []
    for label, n in sorted(counts.items()):
        parts.append(f"{n} {label}{'s' if n != 1 else ''}")
    for label, n in sorted(negated_counts.items()):
        parts.append(f"{n} negated {label}{'s' if n != 1 else ''}")
    return f"Heuristic extraction over {len(text)} chars: {', '.join(parts)}."


def _neuro_summary(text: str, entities: list[ExtractedClinicalEntity]) -> str:
    """Generate a structured summary for neuromodulation extraction."""
    counts: dict[str, int] = {}
    negated_counts: dict[str, int] = {}
    for e in entities:
        if e.normalised and e.normalised.startswith("negated:"):
            negated_counts[e.label] = negated_counts.get(e.label, 0) + 1
        else:
            counts[e.label] = counts.get(e.label, 0) + 1
    if not counts and not negated_counts:
        return f"{len(text)} chars analysed; no neuromodulation entities recovered."
    priority = ["stimulation_protocol", "device_parameter", "electrode_placement", "outcome_measure", "adverse_event", "neuromodulation_device"]
    parts = []
    for p in priority:
        if p in counts:
            parts.append(f"{counts[p]} {p.replace('_', ' ')}{'s' if counts[p] != 1 else ''}")
        if p in negated_counts:
            parts.append(f"{negated_counts[p]} negated {p.replace('_', ' ')}{'s' if negated_counts[p] != 1 else ''}")
    for label, n in sorted(counts.items()):
        if label not in priority:
            parts.append(f"{n} {label.replace('_', ' ')}{'s' if n != 1 else ''}")
    for label, n in sorted(negated_counts.items()):
        if label not in priority:
            parts.append(f"{n} negated {label.replace('_', ' ')}{'s' if n != 1 else ''}")
    return f"Neuromodulation extraction over {len(text)} chars: {'; '.join(parts)}."


def analyze(payload: ClinicalTextInput) -> AnalyzeResponse:
    entities = _extract_entities(payload.text)
    pii = _extract_pii(payload.text)
    return AnalyzeResponse(
        backend="heuristic",
        entities=entities,
        pii=pii,
        summary=_short_summary(payload.text, entities),
        char_count=payload.length,
    )


def extract_pii(payload: ClinicalTextInput) -> PIIExtractResponse:
    return PIIExtractResponse(backend="heuristic", pii=_extract_pii(payload.text))


def deidentify(payload: ClinicalTextInput) -> DeidentifyResponse:
    pii = _extract_pii(payload.text)
    redacted = list(payload.text)
    for ent in sorted(pii, key=lambda e: e.span.start, reverse=True):
        token = f"[{ent.label.upper()}]"
        redacted[ent.span.start : ent.span.end] = list(token)
    return DeidentifyResponse(
        backend="heuristic",
        redacted_text="".join(redacted),
        replacements=pii,
    )


def analyze_neuromodulation(payload: ClinicalTextInput) -> NeuromodulationExtractResponse:
    entities = _extract_neuromodulation_entities(payload.text)
    pii = _extract_pii(payload.text)
    return NeuromodulationExtractResponse(
        backend="heuristic",
        entities=entities,
        pii=pii,
        summary=_neuro_summary(payload.text, entities),
        char_count=payload.length,
    )


def health() -> HealthResponse:
    return HealthResponse(
        ok=True,
        backend="heuristic",
        note="Heuristic regex backend; OPENMED_BASE_URL not configured.",
    )
