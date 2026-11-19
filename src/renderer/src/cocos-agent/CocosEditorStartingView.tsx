import creatorLogoUrl from '../../../../resources/cocos-agent/creator-logo-with-text.png?url'
import { cn } from '@/lib/class-names'
import { cocosText } from './cocos-text'

// Why: the editor page opens on this same screen (GitNexus editor-web index.html); matching its layout and colours, and
// covering the page until it has loaded, hands over to it without a seam.
export function CocosEditorStartingView({ className }: { className?: string }): React.JSX.Element {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col bg-[#363d42] font-['Microsoft_YaHei',Helvetica,Arial,sans-serif]",
        className
      )}
    >
      <span className="flex-1" />
      <img className="mx-auto -mt-[100px] mb-auto" src={creatorLogoUrl} alt="" />
      <div
        role="status"
        className="mx-auto mt-5 mb-auto text-[16px] whitespace-nowrap text-[#dce1e5]"
      >
        {cocosText('editor.starting', 'Loading Cocos Creator')}
      </div>
      <div className="mx-auto mt-4 h-[5px] w-[200px] border border-[#dce1e5] bg-black" />
      <span className="flex-1" />
    </div>
  )
}
