require 'rspec'
require 'irb'
require 'time'

require 'http'
require 'mechanize'

RSpec.shared_context 'http' do
  let (:agent) do
    Mechanize.new do |a|
      a.user_agent_alias = 'Mac Firefox'
    end
  end
end

RSpec.configure do |config|
  config.include_context 'http'

  config.after :suite do
    duration_s = Time.now - config.start_time
    tally = config.reporter.examples.map { _1.execution_result.status }.tally
    msg = "www.tobys.cloud acceptance tests duration #{duration_s.round(2)}s #{tally.to_a.join(" ")}"

    webhook_url = ENV['DISCORD_WEBHOOK_URL']
    if Random.rand(0...60) == 0 && webhook_url
      HTTP.post(webhook_url, :json => { :content => msg })
    else
      puts msg
    end
  end
end
