import creatorLogoUrl from '../../../../resources/cocos-agent/creator-logo-with-text.png?url'
import { cocosText } from './cocos-text'

// Why: the editor page opens on Creator's launch screen (GitNexus editor-web launch-screen.ts); matching its layout and
// colours here hands over to the page without a seam.
export function CocosEditorStartingView(): React.JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[#363d42] font-['Microsoft_YaHei',Helvetica,Arial,sans-serif]">
      <span className="flex-1" />
      <img className="mx-auto -mt-[100px] mb-auto" src={creatorLogoUrl} alt="Cocos Creator" />
      <div
        role="status"
        className="mx-auto mt-5 mb-auto text-[16px] whitespace-nowrap text-[#dce1e5]"
      >
        {cocosText('editor.starting', 'Loading Cocos Creator')}
      </div>
      <div className="mx-auto mt-4 h-[5px] w-[200px] overflow-hidden border border-[#dce1e5] bg-black">
        <span className="block h-full w-2/5 animate-[skill-update-slide_1.35s_ease-in-out_infinite] bg-[#dce1e5] motion-reduce:w-full motion-reduce:animate-none" />
      </div>
      <span className="flex-1" />
      <div className="mx-auto mb-[5px] text-[12px] text-[#686868]">
        © 2024 Xiamen Yaji All rights reserved. <span className="text-white">Privacy Policy</span>
      </div>
    </div>
  )
}
