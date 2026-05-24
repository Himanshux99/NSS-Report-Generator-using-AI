'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast, Toaster } from 'sonner';
import { Loader2, FileText, Calendar, Clock, MapPin, Users, BookOpen, Building, User, Edit, ArrowLeft, Download, Key } from 'lucide-react';
import { generateNssReport, downloadNssDocx } from '@/app/actions/reports';
import type { ParsedNssMarkdown } from '@/lib/reports/docx';

type Step1Values = {
  rawMessage: string;
  majorObjective: string;
  scheme: string;
  organizingUnit: string;
  activityCoordinator: string;
  apiKey: string;
};

function triggerDownload(filename: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedNssMarkdown | null>(null);

  const form1 = useForm<Step1Values>({
    defaultValues: {
      rawMessage: '',
      majorObjective: '',
      scheme: 'NSS',
      organizingUnit: 'NSS-VIT',
      activityCoordinator: 'Prof. Rakshak Sood',
      apiKey: '',
    },
  });

  const onExtract = async (values: Step1Values) => {
    setSubmitting(true);
    try {
      const data = await generateNssReport(values);
      setParsedData(data);
      setStep(2);
      toast.success('Details extracted and report generated successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate report');
    } finally {
      setSubmitting(false);
    }
  };

  type PhotoData = {
    file: File;
    width: number;
    height: number;
  };
  const [photos, setPhotos] = useState<PhotoData[]>([]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const fileList = Array.from(files).slice(0, 4); // Max 4 photos
    const photoDataList: PhotoData[] = [];

    for (const file of fileList) {
      const url = URL.createObjectURL(file);
      const dimensions = await new Promise<{ width: number, height: number }>((resolve) => {
        const img = new window.Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          let w = img.width;
          let h = img.height;
          const MAX_WIDTH = 250;
          if (w > MAX_WIDTH) {
            h = Math.round(h * (MAX_WIDTH / w));
            w = MAX_WIDTH;
          }
          resolve({ width: w, height: h });
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve({ width: 250, height: 200 }); // fallback dimensions
        };
        img.src = url;
      });
      photoDataList.push({ file, ...dimensions });
    }

    setPhotos(photoDataList);
    toast.success(`Successfully added ${photoDataList.length} photo(s).`);
  };

  const onGenerateDocx = async () => {
    if (!parsedData) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('parsedData', JSON.stringify(parsedData));
      formData.append('fallbackDateString', new Date().toISOString());

      const dimensions = photos.map(p => ({ width: p.width, height: p.height }));
      formData.append('photoDimensions', JSON.stringify(dimensions));

      photos.forEach((p, idx) => {
        formData.append('photos', p.file);
      });

      const { filename, fileBase64 } = await downloadNssDocx(formData);
      triggerDownload(filename, fileBase64);
      toast.success('Report downloaded successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to download DOCX');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateDetail = (key: string, value: string) => {
    if (!parsedData) return;
    setParsedData({
      ...parsedData,
      eventDetails: {
        ...parsedData.eventDetails,
        [key]: value,
      },
    });
  };

  const handleUpdateObjectives = (text: string) => {
    if (!parsedData) return;
    setParsedData({
      ...parsedData,
      objectives: text.split('\n').filter(Boolean),
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans py-12 px-4 sm:px-6 lg:px-8">
      <Toaster position="top-center" />
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 py-8 px-8 sm:px-10">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-white rounded-xl shadow-sm flex items-center justify-center overflow-hidden h-14 w-14">
              <img src="/National_Service_Scheme_logo.svg.svg" alt="NSS Logo" className="h-full w-auto object-contain" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Report generator</h1>
              <p className="text-blue-100 mt-1 text-sm">Automatically draft your event reports into DOCX format using AI</p>
            </div>
          </div>
        </div>

        <div className="py-8 px-8 sm:px-10">
          {step === 1 && (
            <form onSubmit={form1.handleSubmit(onExtract)} className="space-y-8">

              {/* Raw Input Section */}
              <div>
                <h2 className="text-lg font-semibold border-b border-gray-200 pb-2 mb-4 text-gray-800 flex items-center gap-2">
                  <Edit className="h-5 w-5 text-indigo-500" /> Raw WhatsApp Message
                </h2>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Paste Message Here *</label>
                  <p className="text-xs text-gray-500 mb-2">Include event details, reporting time, hours alloted, and the list of attendees.</p>
                  <textarea
                    required
                    rows={8}
                    {...form1.register('rawMessage')}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3 border font-mono"
                    placeholder={`📌 Event: Seedball Making\n📌 Event Type : AB1\n📅 Date : 22 May(tomorrow)\n⏰Hours alloted : 3 \n🚉 Reporting Station: andheri\n⏰ Reporting time : 7:30\n📍Cap: 30 volunteers\n\nAttendance:\n1. Shreyas Patil\n2. Vedant Phase`}
                  />
                </div>
              </div>

              {/* Objective */}
              <div>
                <h2 className="text-lg font-semibold border-b border-gray-200 pb-2 mb-4 text-gray-800 flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-indigo-500" /> Major Objective
                </h2>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Objective *</label>
                  <p className="text-xs text-gray-500 mb-2">Provide a descriptive sentence about the event's purpose.</p>
                  <textarea
                    required
                    rows={2}
                    {...form1.register('majorObjective')}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3 border"
                    placeholder="e.g. To teach environmental conservation to underprivileged school students and plant 100 trees in the local area."
                  />
                </div>
              </div>

              {/* Administrative Info */}
              <div>
                <h2 className="text-lg font-semibold border-b border-gray-200 pb-2 mb-4 text-gray-800 flex items-center gap-2">
                  <Building className="h-5 w-5 text-indigo-500" /> Administrative Info
                </h2>
                <div className="grid grid-cols-1 gap-y-6 gap-x-6 sm:grid-cols-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Scheme</label>
                    <input
                      type="text"
                      {...form1.register('scheme')}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2.5 border"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Organizing Unit</label>
                    <input
                      type="text"
                      {...form1.register('organizingUnit')}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2.5 border"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Activity Coordinator</label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="h-4 w-4 text-gray-400" />
                      </div>
                      <input
                        type="text"
                        {...form1.register('activityCoordinator')}
                        className="block w-full pl-10 rounded-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2.5 border"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* API Settings (Optional) */}
              <div className="bg-indigo-50/50 rounded-xl p-6 border border-indigo-100/80 transition-all hover:shadow-md">
                <h2 className="text-lg font-semibold pb-2 mb-3 text-gray-800 flex items-center gap-2">
                  <Key className="h-5 w-5 text-indigo-600 animate-pulse" /> Gemini API Settings (Optional)
                </h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Custom Gemini API Key
                    </label>
                    <input
                      type="password"
                      {...form1.register('apiKey')}
                      className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3 border font-mono transition-all duration-200 bg-white"
                      placeholder="AIzaSy..."
                    />
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Leave blank to use the default system API key from the server environment.
                    Need a key? Generate one at the{' '}
                    <a
                      href="https://aistudio.google.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:text-indigo-800 underline font-semibold transition-colors"
                    >
                      Google AI Studio Website &rarr;
                    </a>
                  </p>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex justify-center items-center rounded-lg border border-transparent bg-indigo-600 py-3 px-8 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Extracting Details...
                    </>
                  ) : (
                    <>
                      Extract & Draft Report
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {step === 2 && parsedData && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between items-center border-b border-gray-200 pb-4">
                <h2 className="text-xl font-bold text-gray-800">Review Report Details</h2>
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800"
                >
                  <ArrowLeft className="mr-1 h-4 w-4" /> Back to Edit
                </button>
              </div>

              <p className="text-sm text-gray-600">
                Please review the details extracted and generated by the AI. You can edit any mistakes below before downloading the final DOCX.
              </p>

              <div className="grid grid-cols-1 gap-y-6 gap-x-6 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Activity Title</label>
                  <input
                    value={parsedData.activityTitle || ''}
                    onChange={(e) => setParsedData({ ...parsedData, activityTitle: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2.5 border"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 flex items-center gap-2"><Calendar className="h-4 w-4" /> Date</label>
                  <input
                    value={parsedData.eventDetails['Date'] || ''}
                    onChange={(e) => handleUpdateDetail('Date', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2.5 border"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 flex items-center gap-2"><Clock className="h-4 w-4" /> Time</label>
                  <input
                    value={parsedData.eventDetails['Time'] || ''}
                    onChange={(e) => handleUpdateDetail('Time', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2.5 border"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 flex items-center gap-2"><MapPin className="h-4 w-4" /> Venue</label>
                  <input
                    value={parsedData.eventDetails['Venue'] || ''}
                    onChange={(e) => handleUpdateDetail('Venue', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2.5 border"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 flex items-center gap-2"><Users className="h-4 w-4" /> Volunteers Count</label>
                  <input
                    value={parsedData.eventDetails['No. of Volunteers'] || ''}
                    onChange={(e) => handleUpdateDetail('No. of Volunteers', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2.5 border"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Objectives</label>
                <textarea
                  rows={4}
                  value={parsedData.objectives.join('\n')}
                  onChange={(e) => handleUpdateObjectives(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3 border"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  rows={5}
                  value={parsedData.description || ''}
                  onChange={(e) => setParsedData({ ...parsedData, description: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3 border"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Impact</label>
                <textarea
                  rows={3}
                  value={parsedData.impact || ''}
                  onChange={(e) => setParsedData({ ...parsedData, impact: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3 border"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Conclusion</label>
                <textarea
                  rows={3}
                  value={parsedData.conclusion || ''}
                  onChange={(e) => setParsedData({ ...parsedData, conclusion: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3 border"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Event Photos (Optional)</label>
                <p className="text-xs text-gray-500 mb-2">Upload up to 4 photos to include in the report.</p>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 border border-gray-300 rounded-md p-2"
                />
                {photos.length > 0 && (
                  <p className="mt-2 text-sm text-indigo-600">{photos.length} photo(s) selected.</p>
                )}
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  onClick={onGenerateDocx}
                  disabled={submitting}
                  className="inline-flex justify-center items-center rounded-lg border border-transparent bg-indigo-600 py-3 px-8 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-5 w-5" />
                      Download Final DOCX
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
